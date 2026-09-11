# QA Live

A Claude Code plugin that runs a real QA pass on your web project: it drives a browser,
works out what your project actually is, tests it, and hands you a self-contained HTML
report with the measurements to back every finding.

It is not a test runner and it does not replace your test suite. It is the pass a careful
human would do before a demo — clicking through the app, watching the console, checking
what breaks on a phone — except it writes the report for you.

**[See an example report](examples/example-report.html)** — a real audit of the official
Vite + React starter, which turns out to have three accessibility violations of its own.

## What you get

**A report** (`.html`, single file, no assets) — metrics, the coverage it ran, findings
graded bug / warning / info each with the measurement that proves it, what works, and
embedded screenshots with the problem areas outlined. Opens anywhere, mails as one
attachment, follows the reader's light or dark theme.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- **Node 18+** — used by the report generator, and by `playwright-cli`
- **playwright-cli** and its skill:
  ```bash
  npm install -g @playwright/cli@latest
  playwright-cli install --skills -g
  ```
- A Chromium-based browser. Chrome is used if present; otherwise the bundled Chromium.

No other dependencies. The report generator is plain Node with no packages and no
platform-specific binaries, so macOS, Linux and Windows behave identically.

## Install

```
/plugin marketplace add OWNER/REPO
/plugin install qa-live@qa-live
```

## Use

Just ask, in whatever language you work in. The effort matches the request:

```
Does the search filter still work?     → focused check, answer in seconds
Test my project                        → full audit, ends in a report
Walk through the sign-up funnel        → flow: ordered steps with expectations
```

For a full audit Claude will look at your project, **propose a test plan, and wait for
your go-ahead** before touching anything. Adjust it in one sentence — "skip checkout,
test the search filters instead" — or tell it to just run. A focused check skips the
ceremony entirely: no plan proposal, no report unless something breaks.

## How it works

**1. Recon.** Reads your `README`, `package.json` and routes, starts the app the way your
project actually starts it, then looks at the live DOM.

**2. Plan.** Proposes 4–7 chapters drawn from what the project *has* — auth, a checkout
funnel, a WebGL canvas, filters, dialogs — not from a fixed checklist. You confirm.
The accepted plan is saved to `.qa-live/plan.json`, so the next run replays the same
coverage and the two reports are comparable.

**3. Run.** Executes the plan, measuring before/after state around every interaction with
a set of built-in probes, then writes the report and cleans up after itself.

Along the way it loads **recipes** — small domain checklists for the kind of project it
found. A WebGL project gets tested for context-loss recovery and `prefers-reduced-motion`
in the render loop; a form gets tested for label coverage and error recovery. Recipes are
read only when they match, so a project never pays for knowledge it does not need.

## Built-in probes

A small measurement library is injected into the page and survives reloads, so findings
come from one short call instead of a wall of improvised JavaScript:

| Probe | Returns |
|---|---|
| `qa.box(sel)` | position, size, centre point, visibility |
| `qa.contrast(sel)` | WCAG ratio and AA/AAA — or a refusal, see below |
| `qa.chain(sel)` | ancestor chain with display / visibility / opacity |
| `qa.perf()` | timing, requests, page weight, heaviest resources, external hosts |
| `qa.media()` | broken images, `alt` coverage, lazy count, formats |
| `qa.links()` | same-origin links, `#` placeholders, anchors that resolve |
| `qa.dialog(sel)` | `role`, `aria-modal`, focus placement, scroll lock |
| `qa.scroller(sel?)` | the container the wheel will actually scroll |
| `qa.overflow()` | horizontal overflow and what causes it |
| `qa.webgl(sel?)` | context version, context loss, CSS size vs backing buffer |
| `qa.outline()` | headings, landmarks, focusable count |
| `qa.at(f, {…})` | scroll to a fraction of the page and read elements there |
| `qa.sweep()` | the whole page summary in one call — for walking several routes |

Two more scripts run once per audit:

**axe-core** (`scripts/axe.js`) — the accessibility engine behind Lighthouse, ~90 rules,
loaded from a CDN at run time with nothing to install. It handles the mechanical checks;
the probes handle what it cannot see — contrast over a canvas, state that only exists
after a scroll, where focus actually went.

**Header audit** (`scripts/headers.js`) — security (`CSP`, `HSTS`, `X-Content-Type-Options`,
`Referrer-Policy`…), caching on static assets, and uncompressed text. A whole category of
real problems that is invisible from inside the page. On localhost it says so and softens
the verdict, since those headers usually come from the CDN in production.

`qa.contrast` is the one worth calling out: it **refuses to answer** when the backdrop is
a gradient, an image, a canvas, or a positioned layer painting behind the text — and when
the element is off-screen. Each refusal names what is in the way. A contrast number
computed from the wrong backdrop is worse than no number at all.

## What makes it different

Most automated audits drown you in findings you then have to disprove. This one is built
around not doing that:

- **Nothing is reported on a single observation.** Transient network failures get re-tested.
- **Structure is explained before it is judged.** A hidden section might be a progressive
  reveal; the skill walks the ancestor chain and finds the trigger before calling it a bug.
- **The instrument is suspected before the project.** A black WebGL canvas is usually
  `preserveDrawingBuffer`, not a broken renderer. A dead click is usually the highlight
  overlay. These are known and worked around.
- **Every finding carries its measurement.** `expected 44.10, got 49.00` — not "the total
  looks wrong".
- **What works is listed as precisely as what doesn't**, so you know what not to break.

## Testing an application, not just a page

**Several pages.** List the routes worth covering in `plan.json` and give each chapter a
`route`. The browser session is reused across pages and the probes reinstall themselves
on every navigation, so a ten-page sweep is one `qa.sweep()` call per route rather than a
fresh boot each time. One page of each *kind* beats every page of one kind.

**Multi-step flows.** A checkout or a sign-up funnel is a `flows` entry: ordered steps,
each with actions and an expectation. Three things make them usable on a real app:

- **Failures are localised.** The flow stops at the broken step and reports *which* one,
  what was expected and what was found. "Blocked at step 3 of 4" beats "the form is broken",
  and steps after it are reported as untested rather than passing.
- **Side effects are mocked by default.** `safety.mock` intercepts the endpoints that
  would send mail or charge a card; `safety.neverSubmit` lists what must never be
  submitted at all. The report states which submissions were mocked.
- **Test data comes from `fixtures`.** `{{run}}` in a value becomes a per-run timestamp,
  so re-running a flow that creates a record does not collide with the last one.

Checkpoints (`state-save`) capture cookies and storage. That genuinely skips the login on
every iteration — but it will not resume a wizard whose step state lives only in the DOM,
so place them where state actually persists.

## From a flow to a CI test

When a flow matters enough to run on every commit, a report is the wrong deliverable:

```bash
node plugins/qa-live/scripts/generate-spec.mjs .qa-live/plan.json signup tests/signup.spec.ts
```

You get an idiomatic Playwright spec — `test.step()` per step, mocks in a `beforeEach`,
fixtures at the top, URL globs turned into anchored regexes — with a `// TODO` wherever
an action has no mapping or a step declared no expectation.

This plugin explores and documents; Playwright runs things repeatedly. The generated spec
is the handover, and it is where a flow should end up once it stops changing.

## Comparing runs

Every audit is kept as JSON under `.qa-live/runs/`. The next one compares against it and
the report opens with what changed:

```
3 new     ·     6 still open     ·     1 fixed
```

Fixed findings are listed by name, and anything new is chipped in the findings list. So
after fixing a contrast problem you re-run and the report tells you directly, instead of
you diffing two documents by eye. Findings are matched on a stable `id`, so rewording a
title does not fake a fix.

## Budgets

Declare your own limits in `.qa-live/plan.json` and the report judges against them
instead of against someone else's idea of "too heavy":

```json
"budgets": { "pageWeightMB": 5, "consoleErrors": 0, "contrastMin": 4.5 }
```

| Metric | Measured | Budget | |
|---|---|---|---|
| Page weight | 3.32 MB | 5 MB | within |
| Console errors | 1 | 0 | over |

A 3D experience can set `pageWeightMB: 45` and stop being told it is bloated. It also
becomes a regression guard: a new dependency taking you from 4 MB to 6 MB gets flagged,
even though 6 MB alone would not look alarming.

Pass `--fail-on-budget` to the generator and it exits non-zero when a budget is exceeded,
which turns the whole thing into a CI gate. The report is still written, so your pipeline
can publish it next to the failure.

## Artifacts

Everything lands in `.qa-live/` inside your project:

```
.qa-live/
├── plan.json           the accepted test plan, reused on later runs
├── runs/               one JSON per audit — what the next run compares against
├── reports/            self-contained HTML reports
├── screenshots/        JPEG captures embedded in the reports
└── state/              flow checkpoints — may hold session cookies
```

Add `.qa-live/` to your `.gitignore` — Claude will offer to. `state/` in particular must
never be committed.

## Reusing and tuning a plan

`plan.json` is meant to be edited. The field worth maintaining is `knownIntentional`:

```json
"knownIntentional": [
  "The contact section is hidden until body.show-footer is set — progressive reveal, not a bug."
]
```

Every deliberate behaviour that once looked like a bug goes there, and the same false
positive is never investigated twice.

## Generating a report on its own

The generator is a standalone script, useful in CI or from your own tooling:

```bash
node plugins/qa-live/scripts/build-report.mjs findings.json report.html
node plugins/qa-live/scripts/build-report.mjs findings.json report.html --previous auto
```

The input schema is documented in
[`findings-schema.md`](plugins/qa-live/skills/qa-live/references/findings-schema.md).

## Working on the plugin

```bash
npm test     # 40 tests, Node's built-in runner, no dependencies
npm run check
```

The report generator and the spec generator export their pure functions so the tests can
reach them. Several of those tests exist because the bug happened: argument parsing that
ate its own input, `{{run}}` losing the timestamp at the start or end of a value, URL
globs compiling to invalid regexes. Add one when you fix something.

## Adding a recipe

Recipes live in `plugins/qa-live/skills/qa-live/recipes/`. Three ship today — `webgl`,
`overlays`, `forms`. Adding one is a Markdown file plus a row in the detection table at
the top of `SKILL.md`. Keep them short and specific: what to check, what the measurement
looks like, and which traps produce false positives in that domain. Pull requests welcome.

## Limits, honestly

- Tested against static sites and a Vite + React app. Other dev servers should work
  through the project's own start command, but only Vite has actually been verified.
- Performance is measured on the production build, never the dev server — the same Vite
  app weighs 3.58 MB served by `vite dev` and 0.09 MB built. The skill knows this and
  builds first; if your project cannot build, its performance numbers are excluded from
  budgets and labelled as such.
- Three recipes so far, and only `webgl` and `overlays` are validated against real projects.
- Flow checkpoints only restore cookies and storage. DOM-only wizards have to be replayed.
- The spec generator covers the common actions and assertions; anything else comes out as
  a TODO for you to write.
- Reports with a dozen full-page screenshots land under 2 MB.
- It tests what it can reach. Anything behind credentials needs you to say how to log in.

## License

MIT
