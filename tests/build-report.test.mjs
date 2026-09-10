import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseArgs, keyOf, diffRuns, buildHTML, esc }
  from '../plugins/qa-live/scripts/build-report.mjs';

const SCRIPT = new URL('../plugins/qa-live/scripts/build-report.mjs', import.meta.url).pathname;

describe('parseArgs', () => {
  test('reads two positionals with no flags', () => {
    const a = parseArgs(['in.json', 'out.html']);
    assert.equal(a.input, 'in.json');
    assert.equal(a.output, 'out.html');
    assert.equal(a.previous, null);
    assert.equal(a.failOnBudget, false);
  });

  // Regression: `--previous` absent made pi === -1, and `i !== pi + 1`
  // then silently dropped the first positional.
  test('does not eat the input when --previous is absent', () => {
    assert.equal(parseArgs(['a.json', 'b.html']).input, 'a.json');
  });

  test('accepts --previous before or after the positionals', () => {
    for (const argv of [
      ['in.json', 'out.html', '--previous', 'prev.json'],
      ['--previous', 'prev.json', 'in.json', 'out.html'],
    ]) {
      const a = parseArgs(argv);
      assert.equal(a.input, 'in.json');
      assert.equal(a.output, 'out.html');
      assert.equal(a.previous, 'prev.json');
    }
  });

  test('picks up --fail-on-budget anywhere', () => {
    const a = parseArgs(['in.json', '--fail-on-budget', 'out.html']);
    assert.equal(a.failOnBudget, true);
    assert.equal(a.input, 'in.json');
    assert.equal(a.output, 'out.html');
  });
});

describe('keyOf', () => {
  test('prefers the explicit id', () => {
    assert.equal(keyOf({ id: 'contrast-hero', title: 'Anything' }), 'contrast-hero');
  });

  test('falls back to a slugged title', () => {
    assert.equal(keyOf({ title: 'Low contrast, on the hero!' }), 'low-contrast-on-the-hero');
  });

  test('slugs identically regardless of punctuation and case', () => {
    assert.equal(keyOf({ title: 'No favicon' }), keyOf({ title: 'no  FAVICON!' }));
  });
});

describe('diffRuns', () => {
  const prev = { findings: [{ id: 'a' }, { id: 'b' }, { title: 'By title' }], meta: { Date: '1 Sep' } };
  const cur = { findings: [{ id: 'b' }, { title: 'By title' }, { id: 'c' }] };

  test('classifies new, still open and fixed', () => {
    const d = diffRuns(cur, prev);
    assert.deepEqual([...d.isNew], ['c']);
    assert.equal(d.stillOpen, 2);
    assert.deepEqual(d.fixed.map((f) => f.id), ['a']);
    assert.equal(d.previousDate, '1 Sep');
  });

  test('a first run against an empty previous marks everything new', () => {
    const d = diffRuns(cur, {});
    assert.equal(d.isNew.size, 3);
    assert.equal(d.fixed.length, 0);
  });

  test('renaming a title without an id fakes a fix — the reason ids exist', () => {
    const renamed = { findings: [{ title: 'By title, reworded' }] };
    const d = diffRuns(renamed, { findings: [{ title: 'By title' }] });
    assert.equal(d.isNew.size, 1);
    assert.equal(d.fixed.length, 1);
  });
});

describe('esc', () => {
  test('escapes the four dangerous characters', () => {
    assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  test('renders null and undefined as empty', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
  });
});

describe('buildHTML', () => {
  test('escapes finding titles but keeps HTML in detail', () => {
    const { html } = buildHTML({
      project: 'P',
      findings: [{ level: 'bug', title: '<script>x</script>', detail: 'uses <code>inline</code>' }],
    });
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<h3><script>/);
    assert.match(html, /uses <code>inline<\/code>/);
  });

  test('omits sections that have no data', () => {
    const { html } = buildHTML({ project: 'P' });
    assert.doesNotMatch(html, /Since last run/);
    assert.doesNotMatch(html, /<h2>Budgets<\/h2>/);
    assert.doesNotMatch(html, /<h2>Screenshots<\/h2>/);
    assert.match(html, /No findings/);
  });

  test('marks over-budget rows as failing', () => {
    const { html } = buildHTML({
      project: 'P',
      budgets: [
        { label: 'Weight', measured: '3 MB', budget: '5 MB', pass: true },
        { label: 'Errors', measured: '2', budget: '0', pass: false },
      ],
    });
    assert.equal((html.match(/tr class="pass"/g) ?? []).length, 1);
    assert.equal((html.match(/tr class="fail"/g) ?? []).length, 1);
  });

  test('chips only the findings absent from the previous run', () => {
    const cur = { project: 'P', findings: [{ id: 'old', title: 'Old' }, { id: 'new', title: 'New' }] };
    const { html } = buildHTML(cur, diffRuns(cur, { findings: [{ id: 'old' }] }));
    assert.equal((html.match(/class="chip">new</g) ?? []).length, 1);
  });

  test('always declares a charset, so accented text is not mojibake', () => {
    const { html } = buildHTML({ project: 'Été' });
    assert.match(html, /<meta charset="utf-8">/);
    assert.match(html, /Été/);
  });
});

describe('cli', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-live-test-'));
  const findings = join(dir, 'f.json');
  const out = join(dir, 'r.html');

  test('writes a report and exits 0 without --fail-on-budget', () => {
    writeFileSync(findings, JSON.stringify({
      project: 'P', budgets: [{ label: 'Errors', measured: '1', budget: '0', pass: false }],
    }));
    const stdout = execFileSync('node', [SCRIPT, findings, out], { encoding: 'utf8' });
    assert.match(stdout, /^OK/m);
    assert.match(readFileSync(out, 'utf8'), /<!doctype html>/);
  });

  test('exits 1 with --fail-on-budget when a budget is exceeded', () => {
    assert.throws(
      () => execFileSync('node', [SCRIPT, findings, out, '--fail-on-budget'], { encoding: 'utf8', stdio: 'pipe' }),
      (err) => err.status === 1,
    );
    // the report is still written, so CI can publish it alongside the failure
    assert.match(readFileSync(out, 'utf8'), /<!doctype html>/);
  });

  test('exits 0 with --fail-on-budget when every budget passes', () => {
    writeFileSync(findings, JSON.stringify({
      project: 'P', budgets: [{ label: 'Errors', measured: '0', budget: '0', pass: true }],
    }));
    execFileSync('node', [SCRIPT, findings, out, '--fail-on-budget'], { encoding: 'utf8' });
  });

  test('fails clearly on unreadable input', () => {
    assert.throws(
      () => execFileSync('node', [SCRIPT, join(dir, 'missing.json'), out], { stdio: 'pipe' }),
      (err) => err.status === 1 && /Cannot read findings file/.test(String(err.stderr)),
    );
  });

  test('a missing screenshot is a warning, not a failure', () => {
    writeFileSync(findings, JSON.stringify({
      project: 'P', screenshots: [{ file: '/nope/none.jpg', title: 'X' }],
    }));
    const res = execFileSync('node', [SCRIPT, findings, out], { encoding: 'utf8', stdio: 'pipe' });
    assert.match(res, /^OK/m);
  });
});
