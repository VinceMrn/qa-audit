# findings.json schema

Input for `scripts/build-report.mjs`. Every key is optional except `project`; empty
sections are left out of the report entirely.

```json
{
  "project": "Acme Storefront",

  "meta": {
    "URL": "http://localhost:8770/",
    "Date": "10 September 2026",
    "Environment": "Chrome headed · macOS",
    "Viewports": "1440×900 · 390×844",
    "Stack": "Next.js 15 · Tailwind",
    "Tool": "playwright-cli 0.1.19 · qa-live"
  },

  "metrics": [
    { "value": "2",  "label": "confirmed bugs",  "tone": "bad" },
    { "value": "0",  "label": "console errors",  "tone": "good" },
    { "value": "3",  "label": "a11y notes",      "tone": "warn" },
    { "value": "1.4", "label": "MB page weight" }
  ],

  "chapters": [
    { "title": "Home — console & network", "detail": "Load, console audit, failed requests." }
  ],

  "budgets": [
    { "label": "Page weight", "measured": "3.32 MB", "budget": "5 MB", "pass": true },
    { "label": "Console errors", "measured": "1", "budget": "0", "pass": false }
  ],

  "findings": [
    {
      "id": "cart-total-ignores-discount",
      "level": "bug",
      "title": "Cart total ignores the discount code",
      "detail": "Applying <code>SAVE10</code> updates the badge but not the total.",
      "evidence": "subtotal      → 49.00\ndiscount shown → -4.90\ntotal          → 49.00   ✗ expected 44.10",
      "fix": "Recompute the total from the discounted subtotal in <code>useCart()</code>."
    }
  ],

  "passed": [
    { "title": "Clean console", "detail": "0 errors, 0 warnings across the whole run." }
  ],

  "screenshots": [
    {
      "file": ".qa-live/screenshots/01-home.jpg",
      "title": "Home 1440×900",
      "caption": "Initial load.",
      "flag": false
    }
  ]
}
```

## Field notes

**`metrics.tone`** — `good` (green), `warn` (amber), `bad` (red), or omitted (default
text colour). Four metrics fit on one row; aim for four.

**`chapters`** — what the run actually covered, in order. Rendered as a numbered
"Coverage" list, so a reader can see the scope before reading the findings. Mirror the
chapters from `plan.json`.

**`findings.id`** — a short stable slug identifying this finding across runs
(`contrast-hero`, `no-favicon`). Matching falls back to the title when absent, so a
reworded title then reads as one finding fixed and another appearing. Set an `id` on
anything you expect to see again.

**`budgets`** — the project's own limits from `plan.json`, already compared. `measured`
and `budget` are display strings (keep the units), `pass` is the verdict. Rendered as a
pass/fail table; omit the key entirely when the project declares no budgets.

**`findings.level`** — `bug` (red, broken), `warning` (amber, degraded or accessibility),
`info` (blue, improvable). Order most severe first; the report preserves array order.

**`findings.evidence`** — plain monospace text, escaped automatically. Put the
**measurement** here — before/after, expected vs actual — not a restatement of the prose.
This field is what makes a report credible; a finding without it usually is not one.

**`screenshots.file`** — path to a `.jpg`, `.png` or `.webp`, absolute or relative to the
working directory. Capture as JPEG: it is around five times smaller than PNG for the same
frame, and the file is embedded as-is with no processing. A missing file is skipped with a
warning rather than failing the build.

**`screenshots.flag`** — `true` outlines the thumbnail in red and colours its title. Use
it only for captures that show a problem.

## HTML in fields

`detail`, `fix`, `note` and `metrics.label` accept inline HTML — use `<code>`, `<strong>`
and `<br>` where they help readability.

All `title` fields and `evidence` are escaped, so `<`, `>` and `&` are safe to type there
as literal characters.
