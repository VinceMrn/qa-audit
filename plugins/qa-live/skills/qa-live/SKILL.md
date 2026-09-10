---
name: qa-live
description: Run a live QA audit of a web project — headed browser, narrated chaptered video, and a self-contained HTML report. Use when the user asks to test a site or app, run a QA pass, audit accessibility or performance in the browser, check for regressions, or record a demo/test video.
---

# QA live

Act as a QA engineer testing a project live, with the camera rolling. Two deliverables:
a **chaptered video** and a **self-contained HTML report**.

Argument: a URL (`https://…`), a local port (`3000`), a project path, or nothing (current project).

Work in three phases. **Never skip phase 1** — it is what makes this work on a project
you have never seen.

---

## Phase 1 — Recon

Find out what this project actually is before deciding what to test.

- `README` — how it runs, what it does, known caveats. The single most useful file.
- `package.json` — scripts, framework, dependencies.
- Routes / entry points — `app/`, `pages/`, `src/routes/`, or plain `.html` files.
- Once served, the DOM: forms, dialogs, canvases, media, `localStorage`, auth walls.

Then get it running. `file://` is **blocked** by playwright-cli, so an HTTP server is
required even for a static site. In order of preference:

1. A URL already given as the argument → nothing to start.
2. The project's own command (`npm run dev`, `pnpm dev`, `make serve`…) — the README wins over guessing.
3. `npx --yes serve -l <port> <dir>` — works anywhere Node is installed.
4. `python3 -m http.server <port>` — only if Python is known to be present.

Pick an unusual port (8770+). Confirm it answers before opening a browser:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/
```

Remember how you started it — you must stop it in phase 3.

---

## Phase 2 — Plan

Propose a test plan and **show it to the user before running anything**. This is the
step that replaces a fixed checklist: chapters come from the project, not from a template.

Cover what this project actually has. A few examples, not a menu to follow:

| If the project has… | A chapter worth running |
|---|---|
| A landing page | Console and network audit, visual check |
| Responsive layout | A second viewport (390×844), navigation as it actually exists |
| Auth | Sign-in flow, protected route, sign-out |
| Forms | Validation, error states, submission |
| A cart / checkout | The funnel end to end |
| Dialogs, drawers, lightboxes | Focus handling, `Escape`, background scroll lock |
| Canvas / WebGL / video | Renders, resizes, no context loss |
| Filters, search, sorting | Before/after state measurements |
| Internal links, downloads | HTTP status of every one |
| Images and media | Lazy-load, broken assets, `alt` coverage |

Keep it to **4–7 chapters**. State them, then ask the user to confirm or adjust in one
sentence. Respect an explicit "just run it" and proceed.

**Save the accepted plan** to `.qa-live/plan.json` in the project. On later runs, load it
and re-run the same chapters instead of redoing recon — that is what makes two reports
comparable over time. Mention when you are reusing a saved plan, and re-run recon if the
project has clearly changed.

---

## Phase 3 — Run

### Setup

```bash
playwright-cli open <URL> --browser=chrome --headed
playwright-cli video-start .qa-live/videos/<name>.webm
```

Drop `--browser=chrome` if Chrome is not installed; chromium is the default.

Put every artifact under `.qa-live/` in the project — `videos/`, `screenshots/`,
`reports/`, plus `plan.json`. Create the directories first. Suggest adding `.qa-live/`
to `.gitignore` once, if it is a git repo and not already ignored.

**Wait for the app to be genuinely ready.** Loaders, heavy assets and async init are
common. Probe real state (loader opacity, canvas presence, element counts) rather than
sleeping blindly.

### Interaction protocol

Every interaction that appears on camera:

```bash
playwright-cli highlight <ref|selector> --style="outline: 3px solid #e85d26"
sleep 1
playwright-cli mousemove <x> <y>     # x AND y — the element's real centre
sleep 1
playwright-cli highlight --hide      # required before clicking, see gotchas
# then: click / fill / press / mousewheel
```

Get the centre from `getBoundingClientRect()` rather than guessing. Between chapters:

```bash
playwright-cli video-chapter "<title>" --description="…" --duration=3000
```

Capture screenshots as **`.jpg`** — `playwright-cli screenshot --filename=<dir>/<name>.jpg`.
JPEG is roughly five times smaller than PNG for the same frame, which keeps the embedded
report shareable. There is no image post-processing anywhere in this skill.

### Measure, don't describe

A finding is only worth reporting if you can show the number behind it. Prefer one
grouped probe per chapter over many small ones:

```bash
playwright-cli --raw eval "(() => { /* … */ return JSON.stringify({ … }); })()"
```

Record before/after pairs around every interaction — that pair *is* the evidence.

---

## Avoiding false positives

A report that cries wolf gets uninstalled. Four rules:

**Never report on a single observation.** `curl` returns transient HTTP 000 and zero-byte
responses. Re-test before concluding.

**Find the mechanism before judging structure.** A `display:none` may be a progressive
reveal driven by a class. Walk the ancestor chain, find the CSS rule or the JS that sets
it, then test the trigger. What looks broken is often deliberate.

**Suspect the instrument before the project.** Three measurements that accuse wrongly:
reading pixels from a WebGL canvas returns black without `preserveDrawingBuffer` (confirm
with a composite screenshot instead); a click that does nothing is usually your own
highlight overlay; a wheel event that does nothing means the cursor is outside the
scrollable container.

**Name what is done well, as precisely as the bugs.** A good pattern already in the
codebase is the best fix to suggest for a bad one elsewhere — and it tells the developer
what not to break.

Then grade: `bug` (broken), `warning` (degraded or accessibility), `info` (improvable).

---

## playwright-cli gotchas

| Gotcha | Work around it |
|---|---|
| `file://` is blocked | serve over HTTP |
| **An active `highlight` makes `click` fail on small targets** (checkbox, icon): the overlay covers the actionability hit-test point and Playwright waits forever | `highlight --hide` right before clicking, then `mousedown` / `mouseup` — the hover is still filmed |
| The wheel only scrolls the container **under the cursor** | `mousemove` to the real scroller's centre first; find it via `overflowY` + `scrollHeight > clientHeight` |
| Refs (`e130`) go stale as soon as the DOM changes | re-`snapshot` after a click, or target by CSS / `getByRole(...)` |
| `eval` takes an **expression**, not statements | wrap in an IIFE: `(() => { … return x })()` |
| Dynamic `import()` is unavailable inside `run-code` | use the Playwright API directly (e.g. `page.screenshot({ path })`) |
| The shell's working directory resets between calls | `cd` inside each command |
| `.playwright-cli/` is created in the working directory | remove it during cleanup |

---

## Report

Write the findings as JSON, then generate the HTML:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-report.mjs" <findings.json> .qa-live/reports/<name>.html
```

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
that proves each one, accessibility notes, what works well, and the paths to both
deliverables. Mention the false leads you ruled out — it is what makes the rest credible.
