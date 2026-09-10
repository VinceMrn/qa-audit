import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { globToRegex, runTemplate, interpolate, buildSpec, q }
  from '../plugins/qa-live/scripts/generate-spec.mjs';

const SCRIPT = new URL('../plugins/qa-live/scripts/generate-spec.mjs', import.meta.url).pathname;

describe('q', () => {
  test('escapes quotes, backslashes and newlines', () => {
    assert.equal(q("it's"), "'it\\'s'");
    assert.equal(q('a\\b'), "'a\\\\b'");
    assert.equal(q('a\nb'), "'a\\nb'");
  });
});

describe('globToRegex', () => {
  // Regression: forward slashes were unescaped, producing /.*.*/signup/profile/
  // which is not a valid regex literal at all.
  test('escapes slashes so the literal parses', () => {
    const re = globToRegex('**/signup/profile');
    assert.equal(re, '/.*\\/signup\\/profile$/');
    assert.doesNotThrow(() => new RegExp(re.slice(1, -1)));
  });

  test('anchors at the end unless the glob ends in a wildcard', () => {
    assert.ok(globToRegex('**/cart').endsWith('$/'));
    assert.ok(!globToRegex('**/cart*').endsWith('$/'));
  });

  test('matches what a glob should match, and nothing more', () => {
    const re = new RegExp(globToRegex('**/signup/profile').slice(1, -1));
    assert.ok(re.test('https://x.test/signup/profile'));
    assert.ok(re.test('https://x.test/a/b/signup/profile'));
    assert.ok(!re.test('https://x.test/signup/profile/extra'));
    assert.ok(!re.test('https://x.test/signup'));
  });

  test('escapes regex metacharacters in the literal part', () => {
    assert.doesNotThrow(() => new RegExp(globToRegex('**/items?id=1+2(3)').slice(1, -1)));
  });
});

describe('runTemplate', () => {
  // Regression: leading and trailing {{run}} lost the runId entirely,
  // producing '-bot' and 'order-' instead of the intended values.
  test('interleaves runId at every position', () => {
    assert.equal(runTemplate('qa+{{run}}@example.test'), "'qa+' + runId + '@example.test'");
    assert.equal(runTemplate('{{run}}-bot'), "runId + '-bot'");
    assert.equal(runTemplate('order-{{run}}'), "'order-' + runId");
    assert.equal(runTemplate('{{run}}'), 'runId');
  });

  test('evaluates to the value a human would expect', () => {
    const runId = '123';
    const evalWith = (src) => Function('runId', `return ${src};`)(runId);
    assert.equal(evalWith(runTemplate('qa+{{run}}@x.test')), 'qa+123@x.test');
    assert.equal(evalWith(runTemplate('{{run}}-bot')), '123-bot');
    assert.equal(evalWith(runTemplate('order-{{run}}')), 'order-123');
  });
});

describe('interpolate', () => {
  test('quotes a plain string', () => {
    assert.equal(interpolate('hello'), "'hello'");
  });

  test('references the fixtures object for a placeholder', () => {
    assert.equal(interpolate('{{email}}'), 'fixtures.email');
    assert.equal(interpolate('pre-{{email}}-post'), "'pre-' + fixtures.email + '-post'");
  });
});

describe('buildSpec', () => {
  const plan = {
    serve: { url: 'http://localhost:3000' },
    fixtures: { email: 'qa+{{run}}@x.test' },
    safety: { mock: ['**/api/signup'] },
  };

  test('emits a spec that parses as JavaScript', () => {
    const spec = buildSpec(plan, {
      id: 'f', title: 'Flow',
      steps: [{
        name: 'One',
        actions: [{ do: 'fill', target: '#email', value: '{{email}}' }, { do: 'click', target: '#go' }],
        expect: { visible: '#done', url: '**/done' },
      }],
    });
    const dir = mkdtempSync(join(tmpdir(), 'qa-spec-'));
    const f = join(dir, 'c.mjs');
    writeFileSync(f, spec);
    execFileSync('node', ['--check', f]);
  });

  test('puts the mocks in a beforeEach', () => {
    const spec = buildSpec(plan, { id: 'f', steps: [] });
    assert.match(spec, /test\.beforeEach/);
    assert.match(spec, /page\.route\('\*\*\/api\/signup'/);
  });

  test('prefers captured code over the action mapping', () => {
    const spec = buildSpec(plan, {
      id: 'f',
      steps: [{
        name: 'One',
        code: ["await page.getByRole('button', { name: 'Next' }).click();"],
        actions: [{ do: 'click', target: '#next' }],
        expect: { visible: '#x' },
      }],
    });
    assert.match(spec, /getByRole\('button', \{ name: 'Next' \}\)/);
    assert.doesNotMatch(spec, /locator\('#next'\)/);
  });

  test('passes a locator expression through instead of wrapping it', () => {
    const spec = buildSpec(plan, {
      id: 'f',
      steps: [{ name: 'x', actions: [{ do: 'click', target: "getByRole('link', { name: 'Go' })" }], expect: { visible: '#a' } }],
    });
    assert.match(spec, /page\.getByRole\('link', \{ name: 'Go' \}\)\.click\(\)/);
  });

  test('leaves a TODO for an unsupported action', () => {
    const spec = buildSpec(plan, {
      id: 'f', steps: [{ name: 'x', actions: [{ do: 'teleport', target: '#a' }], expect: { visible: '#a' } }],
    });
    assert.match(spec, /TODO unsupported action "teleport"/);
  });

  test('leaves a TODO for a step that asserts nothing', () => {
    const spec = buildSpec(plan, { id: 'f', steps: [{ name: 'x', actions: [{ do: 'click', target: '#a' }] }] });
    assert.match(spec, /TODO no expectation declared/);
  });

  test('omits the fixtures block when there are none', () => {
    const spec = buildSpec({ serve: { url: 'u' } }, { id: 'f', steps: [] });
    assert.doesNotMatch(spec, /const fixtures/);
  });
});

describe('cli', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-spec-cli-'));
  const planPath = join(dir, 'plan.json');
  writeFileSync(planPath, JSON.stringify({
    serve: { url: 'http://x' },
    flows: [{ id: 'known', title: 'Known', steps: [{ name: 's', actions: [{ do: 'click', target: '#a' }], expect: { visible: '#b' } }] }],
  }));

  test('writes the spec and creates missing directories', () => {
    const out = join(dir, 'nested', 'deep', 'k.spec.ts');
    const stdout = execFileSync('node', [SCRIPT, planPath, 'known', out], { encoding: 'utf8' });
    assert.match(stdout, /^OK/m);
    assert.match(readFileSync(out, 'utf8'), /@playwright\/test/);
  });

  test('names the available flows when the id is wrong', () => {
    assert.throws(
      () => execFileSync('node', [SCRIPT, planPath, 'nope', join(dir, 'x.spec.ts')], { stdio: 'pipe' }),
      (err) => err.status === 1 && /Available: known/.test(String(err.stderr)),
    );
  });
});
