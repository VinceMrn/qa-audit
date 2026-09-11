#!/usr/bin/env node
/**
 * Build a self-contained HTML QA report from a findings JSON file.
 *
 *   node build-report.mjs <findings.json> <output.html> [--previous <file|auto>] [--fail-on-budget]
 *
 * With --previous, the report also shows what changed since that run: which
 * findings are new, which are still open, and which have been fixed. Pass "auto"
 * to pick the most recent other .json in the same directory as the input.
 *
 * With --fail-on-budget, the process exits 1 when any declared budget is exceeded,
 * which is what makes this usable as a CI gate. The report is still written.
 *
 * No dependencies, no image processing, no platform-specific binaries — screenshots
 * are captured as JPEG during the run and embedded as-is. Runs the same on macOS,
 * Linux and Windows.
 *
 * Input schema: ../skills/qa-audit/references/findings-schema.md
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { extname, resolve, dirname, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const LEVELS = {
  bug: ['Bug', 'bug'],
  warning: ['Warning', 'warn'],
  info: ['Info', 'info'],
};

const MIME = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' };

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Resolve a screenshot path. Two conventions are both reasonable — relative to
 * where the command runs, and relative to the findings file that names them — so
 * try the working directory first and fall back to the file's own directory
 * rather than silently dropping the image.
 */
export function resolveAsset(file, findingsPath) {
  if (!file) return null;
  const candidates = [resolve(file)];
  if (findingsPath) candidates.push(resolve(dirname(resolve(findingsPath)), file));
  return candidates.find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
}

function dataURI(file) {
  if (!file) return null;
  const type = MIME[extname(file).toLowerCase()];
  if (!type) return null;
  return `data:image/${type};base64,${readFileSync(file).toString('base64')}`;
}

/** Stable identity for matching a finding across runs: explicit id, else its title. */
export const keyOf = (f) =>
  String(f.id || f.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);

/** Most recent other .json beside the input — used by `--previous auto`. */
function findPrevious(inputPath) {
  const dir = dirname(resolve(inputPath));
  const self = basename(resolve(inputPath));
  const candidates = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== self)
    .map((f) => ({ f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.path ?? null;
}

/** new / still-open / fixed, comparing this run's findings against a previous run. */
export function diffRuns(current, previous) {
  const prev = new Map((previous.findings ?? []).map((f) => [keyOf(f), f]));
  const cur = new Map((current.findings ?? []).map((f) => [keyOf(f), f]));
  return {
    isNew: new Set([...cur.keys()].filter((k) => !prev.has(k))),
    stillOpen: [...cur.keys()].filter((k) => prev.has(k)).length,
    fixed: [...prev.entries()].filter(([k]) => !cur.has(k)).map(([, f]) => f),
    previousDate: previous.meta?.Date ?? null,
  };
}

export function buildHTML(d, delta = null, findingsPath = null) {
  const meta = Object.entries(d.meta ?? {})
    .map(([k, v]) => `<div><b>${esc(k)}</b> ${esc(v)}</div>`)
    .join('');

  const metrics = (d.metrics ?? [])
    .map((m) => `<div class="metric ${m.tone ?? ''}"><div class="n">${esc(m.value)}</div><div class="l">${m.label ?? ''}</div></div>`)
    .join('');

  const chapters = (d.chapters ?? [])
    .map((c, i) => `<li><span class="ch-num">${i + 1}</span><div><strong>${esc(c.title)}</strong><span>${c.detail ?? ''}</span></div></li>`)
    .join('');

  const chaptersBlock = chapters
    ? `
  <h2>Coverage</h2>
  <div class="panel"><ol class="chapters">${chapters}</ol></div>`
    : '';

  const budgets = (d.budgets ?? [])
    .map((b) => `<tr class="${b.pass ? 'pass' : 'fail'}">
        <td>${esc(b.label)}</td>
        <td class="num">${esc(b.measured)}</td>
        <td class="num">${esc(b.budget)}</td>
        <td class="verdict">${b.pass ? 'within' : 'over'}</td>
      </tr>`)
    .join('\n');
  const budgetsBlock = budgets
    ? `
  <h2>Budgets</h2>
  <div class="panel">
    <table class="budgets">
      <thead><tr><th>Metric</th><th class="num">Measured</th><th class="num">Budget</th><th></th></tr></thead>
      <tbody>${budgets}</tbody>
    </table>
    <p class="foot">Declared by the project in <code>.qa-audit/plan.json</code>.</p>
  </div>`
    : '';

  let deltaBlock = '';
  if (delta) {
    const fixedList = delta.fixed.length
      ? `<ul class="fixed">${delta.fixed.map((f) => `<li>${esc(f.title)}</li>`).join('')}</ul>`
      : '<p class="foot">Nothing from the previous run has been resolved yet.</p>';
    deltaBlock = `
  <h2>Since last run</h2>
  <div class="panel">
    <div class="delta">
      <div class="d-item"><span class="d-n new">${delta.isNew.size}</span> new</div>
      <div class="d-item"><span class="d-n open">${delta.stillOpen}</span> still open</div>
      <div class="d-item"><span class="d-n done">${delta.fixed.length}</span> fixed</div>
    </div>
    ${delta.previousDate ? `<p class="foot">Compared against the run of ${esc(delta.previousDate)}.</p>` : ''}
    ${delta.fixed.length ? '<h4>Resolved since then</h4>' + fixedList : fixedList}
  </div>`;
  }

  const findings = (d.findings ?? [])
    .map((f) => {
      const [label, cls] = LEVELS[String(f.level ?? 'info').toLowerCase()] ?? LEVELS.info;
      const evidence = f.evidence ? `<pre>${esc(f.evidence)}</pre>` : '';
      const fix = f.fix ? `<p class="fix"><strong>Suggested fix —</strong> ${f.fix}</p>` : '';
      const isNew = delta?.isNew.has(keyOf(f)) ? '<span class="chip">new</span>' : '';
      return `      <article class="finding f-${cls}">
        <header><span class="badge b-${cls}">${label}</span><h3>${esc(f.title)}</h3>${isNew}</header>
        <p>${f.detail ?? ''}</p>
        ${evidence}${fix}
      </article>`;
    })
    .join('\n');

  const passed = (d.passed ?? [])
    .map((p) => `<li><strong>${esc(p.title)}</strong><span>${p.detail ?? ''}</span></li>`)
    .join('');
  const passedBlock = passed ? `\n  <h2>What works</h2>\n  <div class="panel"><ul class="ok">${passed}</ul></div>` : '';

  let shots = '';
  let embedded = 0;
  for (const s of d.screenshots ?? []) {
    const uri = dataURI(resolveAsset(s.file, findingsPath));
    if (!uri) continue;
    embedded++;
    shots += `      <figure class="shot${s.flag ? ' flagged' : ''}">
        <img src="${uri}" alt="${esc(s.title)}" loading="lazy">
        <figcaption><strong>${esc(s.title)}</strong><span>${esc(s.caption ?? '')}</span></figcaption>
      </figure>\n`;
  }
  const shotsBlock = shots ? `\n  <h2>Screenshots</h2>\n  <div class="shots">\n${shots}  </div>` : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QA — ${esc(d.project ?? 'report')}</title>
<style>
  :root {
    --bg:#faf8f5; --panel:#fff; --ink:#1a1714; --muted:#6b625a; --line:#e5ded5;
    --accent:#e85d26; --red:#d92d20; --amber:#b54708; --green:#067647; --blue:#175cd3;
    --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme:dark) {
    :root:not([data-theme="light"]) {
      --bg:#141210; --panel:#1e1b18; --ink:#f2ede7; --muted:#a2978c; --line:#332e29;
      --red:#f97066; --amber:#fdb022; --green:#47cd89; --blue:#84caff;
    }
  }
  :root[data-theme="dark"] {
    --bg:#141210; --panel:#1e1b18; --ink:#f2ede7; --muted:#a2978c; --line:#332e29;
    --red:#f97066; --amber:#fdb022; --green:#47cd89; --blue:#84caff;
  }
  * { box-sizing:border-box; }
  body {
    background:var(--bg); color:var(--ink); margin:0;
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
    padding:0 20px; padding-block:0 64px;
  }
  .wrap { max-width:1080px; margin:0 auto; }
  header.top { padding-block:56px 40px; border-bottom:3px solid var(--accent); margin-bottom:40px; }
  .kicker { font:600 11px/1 var(--mono); letter-spacing:.16em; text-transform:uppercase;
    color:var(--accent); margin-bottom:18px; }
  h1 { font-size:clamp(30px,5.5vw,46px); line-height:1.1; margin:0 0 20px; letter-spacing:-.02em; }
  h1 span { color:var(--accent); }
  .meta { display:flex; flex-wrap:wrap; gap:10px 28px; font-size:13px; color:var(--muted); }
  .meta b { color:var(--ink); font-weight:600; }
  h2 { font-size:12px; font-family:var(--mono); font-weight:600; letter-spacing:.16em;
    text-transform:uppercase; color:var(--muted); margin:52px 0 20px;
    padding-bottom:10px; border-bottom:1px solid var(--line); }
  .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px; }
  .metric { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:22px; }
  .metric .n { font-size:40px; font-weight:700; line-height:1; letter-spacing:-.03em; }
  .metric .l { font-size:12px; color:var(--muted); margin-top:9px; }
  .metric.good .n { color:var(--green); }
  .metric.warn .n { color:var(--amber); }
  .metric.bad .n { color:var(--red); }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:24px; }
  ol.chapters { list-style:none; margin:0; padding:0; }
  ol.chapters li { display:flex; gap:15px; align-items:flex-start; padding:13px 0; border-top:1px solid var(--line); }
  ol.chapters li:first-child { border-top:0; padding-top:0; }
  .ch-num { flex:none; width:26px; height:26px; border-radius:50%; background:var(--accent);
    color:#fff; font:600 12px/26px var(--mono); text-align:center; }
  ol.chapters strong, ul.ok strong { display:block; font-size:14.5px; font-weight:600; }
  ol.chapters span, ul.ok span { display:block; font-size:13px; color:var(--muted); margin-top:2px; }
  .finding { background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--line);
    border-radius:12px; padding:22px; margin-bottom:16px; }
  .f-bug { border-left-color:var(--red); }
  .f-warn { border-left-color:var(--amber); }
  .f-info { border-left-color:var(--blue); }
  .finding header { display:flex; gap:12px; align-items:baseline; flex-wrap:wrap; margin-bottom:12px; }
  .finding h3 { margin:0; font-size:17px; letter-spacing:-.01em; }
  .badge { flex:none; font:600 10px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase;
    padding:5px 9px; border-radius:5px; color:#fff; }
  .b-bug { background:var(--red); }
  .b-warn { background:var(--amber); }
  .b-info { background:var(--blue); }
  .finding p { margin:0 0 14px; }
  .chip { font:600 10px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase;
    padding:4px 8px; border-radius:5px; border:1px solid var(--accent); color:var(--accent); }
  .delta { display:flex; flex-wrap:wrap; gap:14px 40px; }
  .d-item { font-size:13px; color:var(--muted); }
  .d-n { display:block; font-size:34px; font-weight:700; line-height:1.1; letter-spacing:-.03em; color:var(--ink); }
  .d-n.new { color:var(--amber); }
  .d-n.done { color:var(--green); }
  .panel h4 { font-size:13px; margin:22px 0 8px; }
  ul.fixed { list-style:none; margin:0; padding:0; }
  ul.fixed li { padding:9px 0 9px 30px; border-top:1px solid var(--line); position:relative;
    font-size:14px; color:var(--muted); }
  ul.fixed li::before { content:"\\2713"; position:absolute; left:2px; top:9px; color:var(--green); font-weight:700; }
  .foot { font-size:12.5px; color:var(--muted); margin:14px 0 0; }
  table.budgets { width:100%; border-collapse:collapse; font-size:14px; }
  table.budgets th { text-align:left; font:600 11px/1 var(--mono); letter-spacing:.12em;
    text-transform:uppercase; color:var(--muted); padding-bottom:10px; border-bottom:1px solid var(--line); }
  table.budgets td { padding:11px 0; border-top:1px solid var(--line); }
  table.budgets .num { text-align:right; font-family:var(--mono); font-size:13px; padding-left:18px; }
  table.budgets th.num { text-align:right; }
  table.budgets .verdict { text-align:right; font:600 11px/1 var(--mono); letter-spacing:.1em;
    text-transform:uppercase; padding-left:18px; white-space:nowrap; }
  table.budgets tr.pass .verdict { color:var(--green); }
  table.budgets tr.fail .verdict, table.budgets tr.fail .num { color:var(--red); }
  pre { font-family:var(--mono); font-size:12.5px; line-height:1.65; background:var(--bg);
    border:1px solid var(--line); border-radius:8px; padding:15px; overflow-x:auto; margin:0 0 14px; }
  code { font-family:var(--mono); font-size:.9em; background:var(--bg);
    border:1px solid var(--line); border-radius:4px; padding:1px 5px; }
  .fix { font-size:14px; padding:13px 15px; background:var(--bg); border-radius:8px; margin:0!important; }
  ul.ok { list-style:none; margin:0; padding:0; }
  ul.ok li { padding:13px 0 13px 30px; border-top:1px solid var(--line); position:relative; }
  ul.ok li::before { content:"\\2713"; position:absolute; left:2px; top:13px; color:var(--green); font-weight:700; }
  .shots { column-count:2; column-gap:18px; }
  @media (max-width:720px) { .shots { column-count:1; } }
  .shot { margin:0 0 18px; background:var(--panel); border:1px solid var(--line);
    border-radius:12px; overflow:hidden; break-inside:avoid; }
  .shot.flagged { border-color:var(--red); }
  .shot img { display:block; width:100%; border-bottom:1px solid var(--line); }
  .shot figcaption { padding:13px 15px; }
  .shot strong { display:block; font-size:13.5px; font-weight:600; }
  .shot.flagged strong { color:var(--red); }
  .shot span { display:block; font-size:12.5px; color:var(--muted); margin-top:3px; }
  footer { margin-top:56px; padding-top:22px; border-top:1px solid var(--line);
    font-size:12.5px; color:var(--muted); }
  footer a { color:var(--accent); }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="kicker">Quality assurance report</div>
    <h1>QA — <span>${esc(d.project ?? '')}</span></h1>
    <div class="meta">${meta}</div>
  </header>

  <h2>Summary</h2>
  <div class="metrics">${metrics}</div>
${deltaBlock}${budgetsBlock}${chaptersBlock}

  <h2>Findings</h2>
${findings || '  <div class="panel">No findings.</div>'}
${passedBlock}
${shotsBlock}

  <footer>Generated by qa-audit + playwright-cli${d.meta?.Date ? ` &middot; ${esc(d.meta.Date)}` : ''}</footer>
</div>
</body>
</html>
`;
  return { html, embedded };
}

/** Split argv into positionals and flags. Exported so the parsing is testable. */
export function parseArgs(argv) {
  const failOnBudget = argv.includes('--fail-on-budget');
  const rest = argv.filter((a) => a !== '--fail-on-budget');
  const pi = rest.indexOf('--previous');
  const previous = pi !== -1 ? rest[pi + 1] ?? null : null;
  const positional = rest.filter((_, i) => i !== pi && (pi === -1 || i !== pi + 1));
  return { input: positional[0] ?? null, output: positional[1] ?? null, previous, failOnBudget };
}

function main() {
  const { input, output, previous: previousArg, failOnBudget } = parseArgs(process.argv.slice(2));

  if (!input || !output) {
    console.error('usage: build-report.mjs <findings.json> <output.html> [--previous <file|auto>] [--fail-on-budget]');
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(readFileSync(input, 'utf8'));
  } catch (err) {
    console.error(`Cannot read findings file "${input}": ${err.message}`);
    process.exit(1);
  }

  let delta = null, comparedTo = null;
  if (previousArg) {
    const prevPath = previousArg === 'auto' ? findPrevious(input) : resolve(previousArg);
    if (!prevPath) {
      console.warn('  ! no previous run found to compare against — skipping the delta section');
    } else if (!existsSync(prevPath)) {
      console.warn(`  ! previous run not found: ${prevPath} — skipping the delta section`);
    } else {
      try {
        delta = diffRuns(data, JSON.parse(readFileSync(prevPath, 'utf8')));
        comparedTo = prevPath;
      } catch (err) {
        console.warn(`  ! cannot parse previous run (${err.message}) — skipping the delta section`);
      }
    }
  }

  const missing = (data.screenshots ?? []).filter((s) => !resolveAsset(s.file, input));
  const { html, embedded } = buildHTML(data, delta, input);

  try {
    writeFileSync(output, html, 'utf8');
  } catch (err) {
    console.error(`Cannot write report to "${output}": ${err.message}`);
    process.exit(1);
  }

  const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
  console.log(`OK  ${output}  ${mb} MB  ·  ${embedded} screenshot(s)`);
  if (delta) {
    console.log(`    vs ${basename(comparedTo)}: ${delta.isNew.size} new, ${delta.stillOpen} still open, ${delta.fixed.length} fixed`);
  }
  const overBudget = (data.budgets ?? []).filter((b) => !b.pass);
  if (overBudget.length) console.log(`    ${overBudget.length} budget(s) exceeded: ${overBudget.map((b) => b.label).join(', ')}`);
  for (const s of missing) console.warn(`  ! screenshot not found, skipped: ${s.file}`);
  if (mb > 8) console.warn('  ! report is large — consider fewer or smaller screenshots');

  if (failOnBudget && overBudget.length) {
    console.error(`FAIL  ${overBudget.length} budget(s) exceeded`);
    process.exit(1);
  }
}

// Only run when invoked directly, so the module can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
