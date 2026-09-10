# plan.json schema

Saved to `.qa-live/plan.json` after the user accepts a test plan. Loading it on a later
run skips recon and re-runs the same chapters, which is what makes two reports comparable.

```json
{
  "project": "Acme Storefront",
  "createdAt": "2026-09-10",
  "serve": {
    "command": "npm run dev",
    "url": "http://localhost:3000",
    "readyCheck": "document.querySelector('#app') !== null"
  },
  "budgets": {
    "pageWeightMB": 5,
    "consoleErrors": 0,
    "contrastMin": 4.5,
    "fcpMs": 1500,
    "brokenMedia": 0
  },
  "viewports": [
    { "label": "desktop", "width": 1440, "height": 900 },
    { "label": "mobile",  "width": 390,  "height": 844 }
  ],
  "chapters": [
    {
      "title": "Home — console & network",
      "detail": "Load the page, audit console and failed requests.",
      "steps": [
        "console + requests audit",
        "screenshot"
      ]
    },
    {
      "title": "Checkout funnel",
      "detail": "Add to cart through to payment step.",
      "steps": [
        "click .add-to-cart, measure cart count before/after",
        "apply discount code, compare subtotal and total",
        "screenshot at each step"
      ]
    }
  ],
  "knownIntentional": [
    "The contact section is hidden until body.show-footer is set — progressive reveal, not a bug.",
    "GPX links have no download attribute on purpose; the server sets the right content-type."
  ]
}
```

## Field notes

**`serve`** — how to start and reach the app. `readyCheck` is a JS expression evaluated
in the page; poll it instead of sleeping. Omit `command` when testing a live URL.

**`chapters.steps`** — intent, in prose, not literal shell commands. The point is to
re-run the same *coverage*, while still adapting to a DOM that has changed since the plan
was written.

**`budgets`** — the project's own limits, which replace the auditor's judgement about
what counts as too heavy or too slow. Free-form: declare only what matters here. A 3D
experience might legitimately set `pageWeightMB: 45` where a landing page sets `2`.
Each declared budget is measured and rendered as a pass/fail row in the report, which
also turns it into a regression guard — a jump from 4 MB to 6 MB gets flagged even though
6 MB is not obviously wrong on its own.

**`knownIntentional`** — the highest-value field over time. Every deliberate behaviour
that once looked like a bug goes here, so the same false positive is never investigated
twice. Append to it whenever a run rules something out.

## Reusing a plan

Load it, tell the user which plan is being reused and when it was created, then run it.
Re-run recon instead if the project changed materially — new routes, a different
framework, chapters whose selectors no longer resolve. Rewrite the plan afterwards.
