# QA Live

A Claude Code plugin that runs a real QA pass on your web project: it drives a visible
browser, works out what your project actually is, tests it, records a chaptered video,
and hands you a self-contained HTML report.

It is not a test runner and it does not replace your test suite. It is the pass a careful
human would do before a demo — clicking through the app, watching the console, checking
what breaks on a phone — except it writes the report for you.

## What you get

**A video** (`.webm`, chaptered) — every interaction is highlighted before it happens, so
the recording is watchable rather than a blur of instant clicks. Usable as-is for a demo,
a bug report, or a walkthrough.

**A report** (`.html`, single file, no assets) — metrics, findings graded bug / warning /
info with the measurement that proves each one, what works, and embedded screenshots.
Opens anywhere, mails as one attachment, follows the reader's light or dark theme.

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

Just ask, in whatever language you work in:

```
Test my project
Run a QA pass on http://localhost:3000
Audit https://example.com and record a video
```

Claude will look at your project, **propose a test plan, and wait for your go-ahead**
before touching anything. Adjust it in one sentence — "skip checkout, test the search
filters instead" — or tell it to just run.

## How it works

**1. Recon.** Reads your `README`, `package.json` and routes, starts the app the way your
project actually starts it, then looks at the live DOM.

**2. Plan.** Proposes 4–7 chapters drawn from what the project *has* — auth, a checkout
funnel, a WebGL canvas, filters, dialogs — not from a fixed checklist. You confirm.
The accepted plan is saved to `.qa-live/plan.json`, so the next run replays the same
coverage and the two reports are comparable.

**3. Run.** Executes the plan with the camera rolling, measuring before/after state around
every interaction, then writes the report and cleans up after itself.

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

## Artifacts

Everything lands in `.qa-live/` inside your project:

```
.qa-live/
├── plan.json           the accepted test plan, reused on later runs
├── reports/            self-contained HTML reports
├── screenshots/        JPEG captures embedded in the reports
└── videos/             chaptered .webm recordings
```

Add `.qa-live/` to your `.gitignore` — Claude will offer to.

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
```

The input schema is documented in
[`findings-schema.md`](plugins/qa-live/skills/qa-live/references/findings-schema.md).

## Limits, honestly

- Tested against static sites and client-rendered apps. Frameworks with their own dev
  server should work through the project's own start command, but coverage there is thinner.
- Reports with a dozen full-page screenshots land around 2–4 MB.
- Video length tracks how much you ask it to test; expect tens of MB for a full pass.
- It tests what it can reach. Anything behind credentials needs you to say how to log in.

## License

MIT
