#!/usr/bin/env node
/**
 * Build a self-contained HTML QA report from a findings JSON file.
 *
 *   node build-report.mjs <findings.json> <output.html>
 *
 * No dependencies, no image processing, no platform-specific binaries — screenshots
 * are captured as JPEG during the run and embedded as-is. Runs the same on macOS,
 * Linux and Windows.
 *
 * Input schema: ../skills/qa-live/references/findings-schema.md
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const LEVELS = {
  bug: ['Bug', 'bug'],
  warning: ['Warning', 'warn'],
  info: ['Info', 'info'],
};

const MIME = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function dataURI(file) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) return null;
  const type = MIME[extname(file).toLowerCase()];
  if (!type) return null;
  return `data:image/${type};base64,${readFileSync(file).toString('base64')}`;
}

function buildHTML(d) {
  const meta = Object.entries(d.meta ?? {})
    .map(([k, v]) => `<div><b>${esc(k)}</b> ${esc(v)}</div>`)
    .join('');

  const metrics = (d.metrics ?? [])
    .map((m) => `<div class="metric ${m.tone ?? ''}"><div class="n">${esc(m.value)}</div><div class="l">${m.label ?? ''}</div></div>`)
    .join('');

  const video = d.video ?? null;
  const chapters = (video?.chapters ?? [])
    .map((c, i) => `<li><span class="ch-num">${i + 1}</span><div><strong>${esc(c.title)}</strong><span>${c.detail ?? ''}</span></div></li>`)
    .join('');

  const videoBlock = video
    ? `
  <h2>Recording</h2>
  <div class="panel">
    <div class="path">${esc(video.path ?? '')}</div>
    <p class="note">${video.note ?? ''}</p>
    <ol class="chapters">${chapters}</ol>
  </div>`
    : '';

  const findings = (d.findings ?? [])
    .map((f) => {
      const [label, cls] = LEVELS[String(f.level ?? 'info').toLowerCase()] ?? LEVELS.info;
      const evidence = f.evidence ? `<pre>${esc(f.evidence)}</pre>` : '';
      const fix = f.fix ? `<p class="fix"><strong>Suggested fix —</strong> ${f.fix}</p>` : '';
      return `      <article class="finding f-${cls}">
        <header><span class="badge b-${cls}">${label}</span><h3>${esc(f.title)}</h3></header>
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
    const uri = dataURI(resolve(s.file));
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
  .path { font-family:var(--mono); font-size:12.5px; background:var(--bg); border:1px solid var(--line);
    border-radius:8px; padding:13px 15px; margin-bottom:8px; overflow-x:auto; white-space:nowrap; color:var(--accent); }
  .note { font-size:12.5px; color:var(--muted); margin:0 0 22px; }
  ol.chapters { list-style:none; margin:0; padding:0; }
  ol.chapters li { display:flex; gap:15px; align-items:flex-start; padding:13px 0; border-top:1px solid var(--line); }
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
${videoBlock}

  <h2>Findings</h2>
${findings || '  <div class="panel">No findings.</div>'}
${passedBlock}
${shotsBlock}

  <footer>Generated by qa-live + playwright-cli${d.meta?.Date ? ` &middot; ${esc(d.meta.Date)}` : ''}</footer>
</div>
</body>
</html>
`;
  return { html, embedded };
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: build-report.mjs <findings.json> <output.html>');
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(readFileSync(input, 'utf8'));
  } catch (err) {
    console.error(`Cannot read findings file "${input}": ${err.message}`);
    process.exit(1);
  }

  const missing = (data.screenshots ?? []).filter((s) => !existsSync(resolve(s.file)));
  const { html, embedded } = buildHTML(data);

  try {
    writeFileSync(output, html, 'utf8');
  } catch (err) {
    console.error(`Cannot write report to "${output}": ${err.message}`);
    process.exit(1);
  }

  const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
  console.log(`OK  ${output}  ${mb} MB  ·  ${embedded} screenshot(s)`);
  for (const s of missing) console.warn(`  ! screenshot not found, skipped: ${s.file}`);
  if (mb > 8) console.warn('  ! report is large — consider fewer or smaller screenshots');
}

main();
