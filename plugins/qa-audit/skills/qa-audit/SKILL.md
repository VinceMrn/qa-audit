---
name: qa-audit
description: Audit a web project in a real browser — console, accessibility, responsive, links, media — and produce a self-contained HTML report. Use when the user asks to audit or test a site or app, run a QA pass, or check what is broken in the browser.
---

# QA audit

Act as a QA engineer testing a project in a visible browser. Deliverable: one
self-contained HTML report.

---

## 0. Tooling

This skill drives the browser through `playwright-cli`. Check it is there, install it if
not — one command, no project setup:

```bash
playwright-cli --version || npm install -g @playwright/cli@latest
```

If `playwright-cli open` later complains about a missing browser:

```bash
playwright-cli install-browser chromium
```

Chrome already on the machine works too: `--browser=chrome` uses it and downloads nothing.

---

## 1. Recon

Look before deciding what to test.

- `README` — how it runs. The most useful file, when it exists.
- `package.json` — scripts and framework.
- The entry HTML and its scripts when there is neither.

Then serve it. **`file://` is blocked**, so an HTTP server is required even for a static
page:

1. A URL given as the argument → nothing to start.
2. The project's own command (`npm run dev`…).
3. `npx --yes serve -l <port> <dir>` for a static folder.

**Read the URL the server prints, never assume the port.** Vite falls back to 5174 when
5173 is taken and says so only on stdout — curl the assumed port and you get `200` from
someone else's server. **Poll until it answers** rather than sleeping once: Vite is up in
under a second, `next dev` takes 5–15 s.

**Stay in the project you were pointed at.** A front end that needs its API is a
constraint to state in the plan, not permission to start services nobody mentioned.

**Never open credential stores.** User tables, `.env` files, session dumps. That such a
file holds plaintext passwords is a finding worth reporting; its contents must never reach
the transcript.

---

## 2. Plan, then stop

Propose 4–6 chapters drawn from what this project actually has — not a fixed list. Those
that usually earn their place:

- console errors and failed requests
- accessibility: headings, landmarks, labels, contrast, keyboard
- a second viewport (390×844) and horizontal overflow
- internal links and anchors that resolve
- images: broken, missing `alt`, lazy loading
- whatever is specific here — a form, a dialog, a canvas, a filter

### Then end your turn

Present the plan and **run nothing**. Not the build, not the server, not the browser.

Ask with `AskUserQuestion` and wait for the user's **next message**.

**The words that invoked the skill are never the go-ahead.** "Lance le skill",
"run the audit", "go ahead" — those start the skill, which means start at recon. They
cannot approve a plan that did not exist when they were typed. Only a reply given after
the plan is shown counts.

This is the rule that makes the tool safe to point at a real project.

---

## 3. Run

**Headed, always.** Watching the browser work is what makes an audit trustworthy — the
user sees what was clicked instead of taking the report on faith.

```bash
playwright-cli open <URL> --browser=chrome --headed
```

Drop `--browser=chrome` if Chrome is absent; the bundled chromium takes over.

Put artifacts in `.qa-audit/` inside the project, and offer to add it to `.gitignore`.
Capture screenshots as **`.jpg`** — roughly five times smaller than PNG, which keeps the
embedded report shareable.

### Measure, do not describe

A finding is worth reporting only with the number behind it. Group measurements into one
call rather than many:

```bash
playwright-cli --raw eval "(() => { /* … */ return JSON.stringify({ … }); })()"
```

Record before/after around every interaction — that pair *is* the evidence.

### Never measure performance on a dev server

The same Vite + React app: **3.58 MB** served by `vite dev`, **0.09 MB** built. Reporting
the dev figure invents a problem. Build and serve the output before any weight or speed
claim, or label the numbers dev-mode and say they are not comparable.

Dev tooling adds console noise too — React's DevTools notice, Vite's HMR client, Next's
overlay. Attribute those to the tooling, not to the project.

---

## 4. Avoid false positives

A report that cries wolf gets ignored. Four rules, each learned the hard way:

**Never report on a single observation.** `curl` returns transient HTTP 000 and zero-byte
responses. Re-test before concluding.

**Find the mechanism before judging.** A `display:none` may be a progressive reveal driven
by a class. Walk the ancestor chain, find the rule that sets it, test the trigger. What
looks broken is often deliberate.

**Suspect the instrument before the project.** Reading pixels from a WebGL canvas returns
black without `preserveDrawingBuffer` — confirm with a screenshot instead. A click that
does nothing is usually your own `highlight` overlay covering the target. A wheel event
that does nothing means the cursor is outside the scrollable container.

**Name what is done well, as precisely as the bugs.** A good pattern already in the
codebase is the best fix to suggest for a bad one elsewhere.

Then grade each finding: **bug** (broken), **warning** (degraded or accessibility),
**info** (improvable).

---

## 5. playwright-cli traps

| Trap | Work around it |
|---|---|
| `file://` blocked | serve over HTTP |
| An active `highlight` makes `click` fail on small targets — the overlay covers the hit-test point | `highlight --hide` before clicking, then `mousedown` / `mouseup` |
| The wheel only scrolls the container under the cursor | `mousemove` to that container's centre first |
| Refs (`e130`) go stale as soon as the DOM changes | re-`snapshot` after a click, or target by CSS |
| `eval` takes an **expression**, not statements | wrap in an IIFE: `(() => { … return x })()` |
| The shell's working directory resets between calls | `cd` inside each command |
| `.playwright-cli/` appears in the working directory | remove it during cleanup |

Acting on a **ref** rather than a CSS selector makes the emitted Playwright code use
`getByRole(...)` instead of `locator('#id')` — worth it whenever the user might reuse it.

---

## 6. Report

Write one self-contained HTML file to `.qa-audit/report.html`: no external assets,
screenshots embedded as base64 data URIs, and a `<meta charset="utf-8">` — without it,
accented text turns to mojibake.

Structure: header with URL and date · four headline numbers · findings worst-first, each
carrying its **measurement** · what works · screenshots, those showing a problem outlined
in red.

A compact style that reads well in both themes:

```html
<style>
  :root { --bg:#faf8f5; --panel:#fff; --ink:#1a1714; --muted:#6b625a; --line:#e5ded5;
          --accent:#e85d26; --red:#d92d20; --amber:#b54708; --green:#067647; }
  @media (prefers-color-scheme:dark) { :root {
          --bg:#141210; --panel:#1e1b18; --ink:#f2ede7; --muted:#a2978c; --line:#332e29;
          --red:#f97066; --amber:#fdb022; --green:#47cd89; } }
  body { background:var(--bg); color:var(--ink); margin:0 auto; max-width:1000px;
         padding:40px 20px; font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  h1 { font-size:38px; letter-spacing:-.02em; } h1 span { color:var(--accent); }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.16em; color:var(--muted);
       border-bottom:1px solid var(--line); padding-bottom:8px; margin-top:48px; }
  .card { background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--line);
          border-radius:12px; padding:20px; margin-bottom:14px; }
  .bug { border-left-color:var(--red); } .warn { border-left-color:var(--amber); }
  pre { background:var(--bg); border:1px solid var(--line); border-radius:8px;
        padding:14px; overflow-x:auto; font-size:12.5px; }
  img { width:100%; border-radius:8px; border:1px solid var(--line); }
</style>
```

Open it with the platform's opener: `open` (macOS), `xdg-open` (Linux), `start` (Windows).

---

## 7. Cleanup

Always, even if the audit stopped partway:

```bash
playwright-cli close
# stop the server you started
rm -rf .playwright-cli
```

Close with a short summary in the user's language: the confirmed bugs with the measurement
proving each, what works, and the path to the report. Mention the false leads you ruled
out — that is what makes the rest credible.
