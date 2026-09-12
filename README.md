# QA Audit

A Claude Code skill that audits a web project in a **visible browser** and hands you a
self-contained HTML report.

It is not a test runner and it does not replace your test suite. It is the pass a careful
person does before a demo — clicking through the app, watching the console, checking what
breaks on a phone — except it writes the report for you.

One file. No dependencies beyond `playwright-cli`, which the skill installs itself if it
is missing.

## Install

```
/plugin marketplace add VinceMrn/qa-audit
/plugin install qa-audit@qa-audit
```

Then **restart Claude Code** — plugins load at startup.

To update later, both commands are needed:

```bash
claude plugin marketplace update qa-audit   # refresh the source
claude plugin update qa-audit               # update the installed copy
```

`claude plugin details` reports the version available in the marketplace, not the one
running. The truth is in `~/.claude/plugins/installed_plugins.json`.

## Requirements

- [Claude Code](https://claude.com/claude-code) and **Node 18+**
- `playwright-cli` — installed by the skill on first use if absent
- A Chromium-based browser: your own Chrome, or `playwright-cli install-browser chromium`

## Use

Ask, in whatever language you work in:

```
Audite mon projet
Audit this app
Check what is broken on http://localhost:3000
```

It looks at your project, **proposes a plan of 4–6 chapters, and stops there**. Nothing
runs until you reply — not the build, not the server, not the browser. Adjust in one
sentence, or approve it.

Then the browser opens **in front of you** and the audit runs.

## What it checks

Chapters come from what your project actually has, not from a fixed list. Usually:
console errors and failed requests, accessibility (headings, landmarks, labels, contrast,
keyboard), a phone viewport, internal links, images — plus whatever is specific to your
project: a form, a dialog, a canvas, a filter.

## Why it is worth trusting

Most automated audits bury you in findings you then have to disprove. This one is built
around not doing that:

- **Nothing is reported on a single observation.** Transient failures get re-tested.
- **Structure is explained before it is judged.** A hidden section might be a progressive
  reveal; the skill finds the trigger before calling it a bug.
- **The instrument is suspected before the project.** A black WebGL canvas is usually
  `preserveDrawingBuffer`, not a broken renderer. A dead click is usually the highlight
  overlay. Both are known and worked around.
- **Performance is never measured on a dev server.** The same Vite app weighs 3.58 MB
  served by `vite dev` and 0.09 MB built — reporting the first invents a problem.
- **Every finding carries its measurement**, and what works is listed as precisely as what
  does not.

## Limits

Verified on static sites and a Vite + React app, on macOS and Windows. Other dev servers
should work through your own start command, but have not been checked.

## License

MIT
