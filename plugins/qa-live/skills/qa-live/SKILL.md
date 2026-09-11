---
name: qa-live
description: Run a live QA audit of a web project — drives a real browser, measures what it finds, and produces a self-contained HTML report with annotated screenshots. Use when the user asks to test a site or app, run a QA pass, audit accessibility or performance in the browser, or check for regressions.
---

# QA live

Act as a QA engineer testing a project in a real browser. Deliverable: a **self-contained
HTML report** — measurements, graded findings, annotated screenshots, one file.

Argument: a URL (`https://…`), a local port (`3000`), a project path, a feature to check,
or nothing (current project).

## Pick the scope first

Match the effort to what was actually asked. Most requests are the first kind.

| The request | Mode | What you do |
|---|---|---|
| "check the search filter", "does the cart still work" | **Focused** | targeted recon, run that one thing, answer in the terminal. No plan proposal, no HTML report unless something breaks or the user asks. Seconds, not minutes. |
| "test my project", "run a QA pass", "audit this" | **Full audit** | the three phases below, ending in a report. |
| "test the checkout funnel", "walk through sign-up" | **Flow** | a `flows` entry — ordered steps with expectations and checkpoints. See phase 3. |

State which mode you picked in one line before starting, so the user can redirect you
cheaply. A focused check that uncovers something serious should say so and offer the
full audit — not silently expand into one.

The rest of this file describes the full audit. Focused and flow runs reuse the same
probes, the same false-positive discipline and the same recipes; they just skip the
ceremony.

---

Work in three phases. **Never skip phase 1** — it is what makes this work on a project
you have never seen.

---

## Phase 1 — Recon

Find out what this project actually is before deciding what to test.

- `README` — how it runs, what it does, known caveats. The single most useful file.
- `package.json` — scripts, framework, dependencies.
- Routes / entry points — `app/`, `pages/`, `src/routes/`, or plain `.html` files.
- Once served, the DOM: forms, dialogs, canvases, media, `localStorage`, auth walls.

There may be neither README nor `package.json`. Read the entry HTML and its scripts
instead — script tags, inlined data, and library names tell you most of it. Never `cat`
a file blindly; check its size first, since assets are sometimes inlined into JS.

Then get it running. `file://` is **blocked** by playwright-cli, so an HTTP server is
required even for a static site. In order of preference:

1. A URL already given as the argument → nothing to start.
2. The project's own command (`npm run dev`, `pnpm dev`, `make serve`…) — the README wins over guessing.
3. `npx --yes serve -l <port> <dir>` — works anywhere Node is installed.
4. `python3 -m http.server <port>` — only if Python is known to be present.

Pick an unusual port (8770+) for a server you start yourself. Remember how you started
it — you must stop it in phase 3.

### Dev servers need three precautions

Verified against a Vite + React project; every one of these is a silent wrong answer,
not a crash.

**Read the URL the server prints. Never assume the port.** Vite falls back to 5174 when
5173 is taken and says so only on stdout. Curl the port you assumed and you get `200`
from *somebody else's server*, then audit the wrong application without noticing. Log
the output and take the URL from it:

```bash
npm run dev > .qa-live/dev.log 2>&1 &
# then poll the log for the address it actually bound to
grep -oE 'https?://localhost:[0-9]+' .qa-live/dev.log | head -1
```

**Poll for readiness, do not sleep once.** Vite is up in ~350 ms, but `next dev` compiles
for 5–15 s on first hit. A single curl after a fixed delay opens the browser on a dead
page. Loop until it answers, with a ceiling:

```bash
for i in $(seq 1 30); do curl -sf -o /dev/null "$URL" && break; sleep 1; done
```

**Never measure weight or speed against a dev server.** This is the one that matters.
The same Vite + React app, measured both ways:

| | dev server | production build |
|---|---|---|
| page weight | 3.58 MB | **0.09 MB** |
| requests | 20 | 7 |
| first paint | 392 ms | 56 ms |

Forty times the weight, because the dev server ships unbundled modules. Reporting that
as a finding — or worse, failing a budget on it — is a fabricated problem. So for
anything performance-related, **build and serve the output** (`npm run build` then
`vite preview`, `next start`, or serve `dist/`). If you cannot build, still audit
behaviour and accessibility on the dev server, but label every performance number as
dev-mode and exclude it from budgets. Say so in the report.

**Dev tooling also adds console noise.** React logs its DevTools suggestion, Vite injects
an HMR client, Next renders a dev overlay. Attribute those to the tooling rather than the
project, and prefer the production build when judging the console at all.

### Load the matching recipes

Recipes carry domain knowledge a generalist pass would miss. Read the ones that match
what you found, and only those — they exist so the skill stays small while going deep
where it matters.

| Signal in the project | Read |
|---|---|
| `<canvas>`, Three.js, Babylon, PixiJS, WebGL | [recipes/webgl.md](recipes/webgl.md) |
| `<dialog>`, modal, drawer, sheet, lightbox, cookie banner | [recipes/overlays.md](recipes/overlays.md) |
| `<form>`, sign-in, sign-up, checkout, contact | [recipes/forms.md](recipes/forms.md) |

None matching is normal — the phase 2 table below still applies. If a project type comes
up repeatedly and no recipe covers it, say so at the end: that is how the set grows.

---

## Phase 2 — Plan

Propose a test plan and **show it to the user before running anything**. This is the
step that replaces a fixed checklist: chapters come from the project, not from a template.

Cover what this project actually has. A few examples, not a menu to follow:

| If the project has… | Worth a chapter |
|---|---|
| A landing page | Console and network audit, page weight |
| Responsive layout | A second viewport (390×844), navigation as it actually exists |
| Auth | Sign-in flow, protected route, sign-out |
| Forms | Validation, error states, submission |
| A cart / checkout | The funnel end to end |
| Dialogs, drawers, lightboxes | Focus handling, `Escape`, background scroll lock |
| Canvas / WebGL / video | Renders, resizes, no context loss, `prefers-reduced-motion` |
| Scroll-driven animation | State sampled across the scroll range |
| Filters, search, sorting | Before/after state measurements |
| Internal links, downloads | HTTP status of every one |
| Images and media | Lazy-load, broken assets, `alt` coverage |

Keep it to **4–7 chapters**. State them, then ask the user to confirm or adjust in one
sentence. Respect an explicit "just run it" and proceed.

### More than one page

For an application rather than a page, list the routes worth covering in `plan.json`
and give each chapter a `route`. Keep the list short and representative — **one of each
*kind* of page beats every page of one kind**. Ten product pages tell you what one does.

Propose the route list and let the user prune it. Discovering routes by following every
link makes the scope explode; enumerate from the router, the file tree, or the nav, then
confirm.

Some checks are per-route (console, weight, images, contrast, headings) and some are
global (nav consistency, dead links across the site). Say which is which in the plan.

**Save the accepted plan** to `.qa-live/plan.json` in the project. On later runs, load it
and re-run the same chapters instead of redoing recon — that is what makes two reports
comparable over time. Mention when you are reusing a saved plan, and re-run recon if the
project has clearly changed.

### Budgets

`plan.json` may declare a `budgets` object — the project's own limits, which replace your
judgement about what counts as too heavy or too slow. A 3D experience and a landing page
do not share a weight budget, and only the developer knows which applies.

Measure each declared budget, then emit the comparison in `findings.json` under `budgets`
so the report renders a pass/fail table. Going over budget is a finding in its own right;
staying within it is worth stating too, because it turns the next regression into a signal.

If no budgets are declared, judge with the usual defaults and **offer to write the ones
this run implies** — measured values make far better starting budgets than invented ones.

---

## Phase 3 — Run

### Setup

```bash
playwright-cli open <URL> --browser=chrome
playwright-cli run-code --filename="${CLAUDE_PLUGIN_ROOT}/scripts/probes.js"
```

Two more scripts are worth running once each on any real audit:

```bash
# ~90 accessibility rules, loaded from a CDN — the engine behind Lighthouse
playwright-cli run-code --filename="${CLAUDE_PLUGIN_ROOT}/scripts/axe.js"

# security, caching and compression headers — invisible from inside the page
playwright-cli run-code --filename="${CLAUDE_PLUGIN_ROOT}/scripts/headers.js"
```

**Measure performance before running axe.** It loads its engine from a CDN, so anything
run afterwards sees an extra request and an extra external host in `qa.perf()`. Take the
perf reading first, then audit accessibility.

`axe.js` covers the mechanical accessibility checks far better than any probe could, and
it is also **more accurate than `qa.contrast` on a flat background** — it resolves the
element's own painted background where the probe may walk past it. Measured on the same
button: axe 3.82:1, the probe 4.39:1; axe was right.

So the division is: axe owns standard contrast and the ~90 mechanical rules. `qa.contrast`
exists for what axe cannot see — text over a canvas, a gradient, or a positioned layer —
where it refuses to answer rather than guess. Re-run axe after opening a dialog: it only
sees what is in the DOM at that moment.

`headers.js` reloads once with a listener attached and grades what comes back. On
**localhost it says so and softens the verdict** — production headers usually come from
the CDN or reverse proxy, so a missing CSP locally is a prompt to check the deployed site,
not a defect. Caching and compression findings, on the other hand, are real either way.

Drop `--browser=chrome` if Chrome is not installed; chromium is the default.
Add `--headed` only if the user wants to watch.

Artifacts go under `.qa-live/` in the project — `screenshots/`, `reports/`, `runs/`,
`state/`, plus `plan.json`. Create the directories first, and suggest adding `.qa-live/`
to `.gitignore` once, if it is a git repo and not already ignored. `runs/` holds one JSON
per audit and is what the next run compares against, so never overwrite an old one.
`state/` holds flow checkpoints and **may contain session cookies — it must never be
committed**, which is another reason to get `.gitignore` right early.

**Wait for the app to be genuinely ready.** Loaders, heavy assets and async init are
common. Probe real state (loader opacity or removal, canvas presence, element counts)
rather than sleeping blindly.

### Measure with the probes

`probes.js` installs `window.qa` and re-installs it after every reload. Prefer it over
hand-written expressions — one short call replaces a long inline script, and the probes
already know where the traps are.

| Probe | Returns |
|---|---|
| `qa.box(sel)` | position, size, `cx`/`cy` centre for `mousemove`, visibility |
| `qa.contrast(sel)` | WCAG ratio and AA/AAA — **or `reliable:false` with the reason** |
| `qa.chain(sel)` | ancestor chain with display / visibility / opacity — the "find the mechanism" probe |
| `qa.perf()` | timing, request count, page weight, heaviest resources, external hosts |
| `qa.media()` | broken images, `alt` coverage, lazy count, formats, video errors |
| `qa.links()` | same-origin links, `#` placeholders, whether each anchor resolves |
| `qa.dialog(sel)` | `role`, `aria-modal`, label, focus placement, scroll lock |
| `qa.scroller(sel?)` | the container the wheel will actually scroll, with its centre |
| `qa.overflow()` | horizontal overflow and the elements causing it |
| `qa.webgl(sel?)` | context version, context loss, CSS size vs backing buffer |
| `qa.outline()` | headings, landmarks, `aria-hidden` count, focusable count |
| `qa.at(f, {k: sel})` | scrolls to fraction `f` and reads those elements — one call per sample |
| `qa.sweep()` | the whole page summary in one call — use it per route when walking several |

Call them through `--raw eval` and wrap in `JSON.stringify`:

```bash
playwright-cli --raw eval "JSON.stringify(qa.perf())"
playwright-cli --raw eval "JSON.stringify(qa.at(0.5, {alt:'#g-alt', spd:'#g-spd'}))"
```

`qa.contrast` refuses to answer rather than guess: off-screen elements, gradient or image
backdrops, and positioned layers painting behind the text all return `reliable:false` with
the reason and the element's centre point. **Trust that refusal** — scroll it into view and
retry, or sample the rendered pixels from a screenshot. A contrast number computed from
the wrong backdrop is worse than no number.

For anything the probes do not cover, write a grouped IIFE returning one JSON object
rather than several small evals.

### Interact

Interact directly — click, fill, press, `mousewheel`. Get coordinates from `qa.box(sel).cx/cy`
rather than guessing.

**Target by ref inside a flow.** Every action prints the equivalent Playwright code, and
its quality depends entirely on how you targeted:

```bash
playwright-cli fill "#email" "…"   →  page.locator('#email').fill('…')                  brittle
playwright-cli fill e2 "…"         →  page.getByRole('textbox', { name: 'Email' })…     resilient
```

So `snapshot` first and act on refs whenever the step will end up in a generated test —
role-based locators survive a redesign that renames a class. **Keep those emitted lines**
(they are in the `### Ran Playwright code` block) and store them on the step as `code`;
the spec generator prefers them over its own mapping. `generate-locator <ref> --raw`
gives the same locator without performing the action.

For throwaway measurement, a CSS selector is fine and faster.

Use `highlight` only when a screenshot needs to point at something:

```bash
playwright-cli highlight <sel> --style="outline: 3px solid #e85d26"
playwright-cli screenshot --filename=.qa-live/screenshots/<n>-<name>.jpg
playwright-cli highlight --hide
```

Orange for what is being demonstrated, red (`#ff2d2d`) for an anomaly. Always hide the
highlight before clicking anything — see the gotchas.

Capture screenshots as **`.jpg`**: roughly five times smaller than PNG for the same frame,
which keeps the embedded report shareable. There is no image post-processing anywhere.

### Measure, don't describe

A finding is only worth reporting if you can show the number behind it. Record before/after
pairs around every interaction — that pair *is* the evidence.

### Walking several routes

Navigate within the same browser session — never reopen it per page. The probes reinstall
themselves on navigation, so `qa.sweep()` works immediately after every `goto`. One call
per route instead of four keeps a ten-page walk cheap.

Collect the sweeps, then report per-route differences rather than repeating what is true
everywhere. "Every page is missing a `<h1>` except /about" is useful; ten identical
paragraphs are not.

### Running a flow

A flow is an ordered sequence where each step depends on the last — a checkout, a
sign-up, a multi-step form. Four rules make them work.

**Read `safety` before touching anything.** Apply every `mock` pattern with
`playwright-cli route "<pattern>" --status=200 --body='{}'` before the first step, and
never submit anything listed in `neverSubmit`. If a flow would send real mail, charge a
card or write to production and no mock covers it, **stop and ask**. The report must say
which submissions were mocked — otherwise it implies an end-to-end pass that never happened.

**Use the fixtures.** Take values from `plan.fixtures` rather than inventing them.
`{{run}}` in a fixture is replaced with a per-run timestamp so a re-run does not collide
with the record the last one created.

**Save state at checkpoints.** After a step with a `checkpoint`, run
`playwright-cli state-save .qa-live/state/<name>.json`.

Be precise about what this buys, because it is easy to over-promise: `state-save`
captures **cookies and storage, nothing else**. So it genuinely skips work when progress
lives there — an authenticated session above all, or a wizard that saves its draft to
`localStorage`. It does **not** resume a wizard whose step state lives only in the DOM:
loading the state gives you a logged-in browser back at step one.

Check before relying on it. If `document.cookie` is empty and both storages are empty at
the checkpoint, the file will be `{"cookies":[],"origins":[]}` and resuming is an
illusion — say so and replay the steps instead. Even then the checkpoint is worth taking
when the flow starts with a login: skipping authentication on every iteration is usually
where the real time goes.

**Stop at the first failure and localise it.** When a step's expectation fails, the flow
ends there. Report *which* step broke, what was expected, what was found, and capture a
screenshot of that exact state. "Blocked at step 3 of 4: expected `#step-profile` visible,
still on `/signup`" is actionable. "The sign-up is broken" is not. Steps after the failure
are untested, not passing — say so.

### Handing the flow to CI

When a flow matters enough to run on every commit, a report is the wrong deliverable.
Generate a real Playwright test instead:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/generate-spec.mjs" .qa-live/plan.json <flowId> tests/<flowId>.spec.ts
```

It emits an idiomatic spec — `test.step()` per step, the mocks in a `beforeEach`, fixtures
at the top — and leaves a `// TODO` wherever an action has no mapping or a step has no
expectation. Offer this whenever a flow passes twice in a row: this plugin explores and
documents, Playwright runs things repeatedly, and the generated spec is the handover.

---

## Avoiding false positives

A report that cries wolf gets uninstalled. Four rules:

**Never report on a single observation.** `curl` returns transient HTTP 000 and zero-byte
responses. Re-test before concluding.

**Find the mechanism before judging structure.** A `display:none` may be a progressive
reveal driven by a class; an element that will not take focus may sit under a
`visibility:hidden` reveal wrapper that has not fired yet. Run `qa.chain(sel)`, find the
rule or the script responsible, then test the trigger. What looks broken is often deliberate.

**Suspect the instrument before the project.** Measurements that accuse wrongly: reading
pixels from a WebGL canvas returns black without `preserveDrawingBuffer` (confirm with a
composite screenshot); a click that does nothing is usually your own highlight overlay; a
wheel event that does nothing means the cursor is outside the scrollable container; any
measurement taken on an off-screen element is meaningless.

**Name what is done well, as precisely as the bugs.** A good pattern already in the
codebase is the best fix to suggest for a bad one elsewhere — and it tells the developer
what not to break.

Then grade: `bug` (broken), `warning` (degraded or accessibility), `info` (improvable).

---

## playwright-cli gotchas

| Gotcha | Work around it |
|---|---|
| `file://` is blocked | serve over HTTP |
| **An active `highlight` makes `click` fail on small targets** (checkbox, icon): the overlay covers the actionability hit-test point and Playwright waits forever | `highlight --hide` before clicking, then `mousedown` / `mouseup` |
| The wheel only scrolls the container **under the cursor** | `qa.scroller()`, then `mousemove` to its centre |
| Refs (`e130`) go stale as soon as the DOM changes | re-`snapshot` after a click, or target by CSS / `getByRole(...)` |
| `eval` takes an **expression**, not statements | wrap in an IIFE: `(() => { … return x })()` |
| Dynamic `import()` is unavailable inside `run-code` | use the Playwright API directly (e.g. `page.screenshot({ path })`) |
| Emulating media needs `run-code` | `page.emulateMedia({ reducedMotion: 'reduce' })`, then reload |
| The shell's working directory resets between calls | `cd` inside each command |
| `.playwright-cli/` is created in the working directory | remove it during cleanup |

---

## Report

Write the findings to the run history, then generate the HTML:

```bash
# keep every run, named so they sort chronologically
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-report.mjs" \
  .qa-live/runs/<YYYY-MM-DD-HHMM>.json \
  .qa-live/reports/<YYYY-MM-DD-HHMM>.html \
  --previous auto
```

Add `--fail-on-budget` to exit non-zero when a declared budget is exceeded — that is what
makes the generator usable as a CI gate. The report is still written, so the pipeline can
publish it alongside the failure.

`--previous auto` picks the most recent other run in `.qa-live/runs/` and adds a
**Since last run** section: how many findings are new, still open, and fixed. Pass an
explicit path to compare against a specific run, or omit the flag on a first run — a
missing previous run is a warning, never an error.

Findings are matched across runs by their `id`, falling back to the title. **Give each
finding a short stable `id`** (`contrast-hero`, `no-favicon`) and keep it identical
between runs, otherwise rewording a title makes one finding look fixed and another new.

The script embeds the screenshots, handles the full document (charset, light/dark theme,
two-column layout) and needs no dependencies — **never hand-write that HTML.** Only write
the JSON; its schema is in [references/findings-schema.md](references/findings-schema.md).

Open it with the platform's opener: `open` (macOS), `xdg-open` (Linux), `start` (Windows).

---

## Cleanup

Always, even if the audit failed partway:

```bash
playwright-cli close
# stop the server you started, by PID or pattern
rm -rf .playwright-cli
```

Deliverables under `.qa-live/` stay.

---

## Reporting back

Close with a short summary in the user's language: confirmed bugs with the measurement
that proves each one, accessibility notes, what works well, and the path to the report.
Mention the false leads you ruled out — it is what makes the rest credible.
