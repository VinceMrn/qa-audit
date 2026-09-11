# plan.json schema

Saved to `.qa-live/plan.json` after the user accepts a test plan. Loading it on a later
run skips recon and re-runs the same coverage, which is what makes two reports comparable.

Everything is optional. A one-page site needs `serve` and `chapters`; an application
grows into `routes`, `flows`, `fixtures` and `safety`.

```json
{
  "project": "Acme Storefront",
  "createdAt": "2026-09-11",

  "serve": {
    "command": "npm run dev",
    "buildCommand": "npm run build",
    "previewCommand": "npm run preview",
    "url": "http://localhost:3000",
    "readyCheck": "document.querySelector('#app') !== null"
  },

  "budgets": { "pageWeightMB": 5, "consoleErrors": 0, "contrastMin": 4.5, "fcpMs": 1500 },

  "viewports": [
    { "label": "desktop", "width": 1440, "height": 900 },
    { "label": "mobile",  "width": 390,  "height": 844 }
  ],

  "routes": [
    { "path": "/",            "label": "Home" },
    { "path": "/products",    "label": "Catalogue" },
    { "path": "/products/42", "label": "Product detail" },
    { "path": "/account",     "label": "Account", "requires": "signed-in" }
  ],

  "fixtures": {
    "email": "qa+{{run}}@example.test",
    "password": "Test1234!",
    "card": "4242424242424242"
  },

  "safety": {
    "mock": ["**/api/checkout", "**/api/signup"],
    "neverSubmit": ["#contact-form"],
    "note": "Staging DB, safe to create records. Payment must always be mocked."
  },

  "chapters": [
    {
      "title": "Catalogue — filters",
      "route": "/products",
      "detail": "Filter by category and price, measure the result count before and after.",
      "steps": ["apply the category filter", "compare visible card count", "clear and confirm reset"]
    }
  ],

  "flows": [
    {
      "id": "signup",
      "title": "Sign-up funnel",
      "safety": { "mock": ["**/api/signup"] },
      "steps": [
        {
          "name": "Account details",
          "actions": [
            { "do": "click",  "target": "getByRole('link', { name: 'Sign up' })" },
            { "do": "fill",   "target": "#email",    "value": "{{email}}" },
            { "do": "fill",   "target": "#password", "value": "{{password}}" },
            { "do": "click",  "target": "button[type=submit]" }
          ],
          "expect": { "visible": "#step-profile", "url": "**/signup/profile" },
          "checkpoint": "after-account"
        }
      ]
    }
  ],

  "knownIntentional": [
    "The contact section is hidden until body.show-footer is set — progressive reveal, not a bug."
  ]
}
```

## Field notes

**`serve`** — how to start and reach the app. `readyCheck` is a JS expression evaluated
in the page; poll it instead of sleeping. Omit `command` when testing a live URL.

Add `buildCommand` and a separate `previewCommand` when the project has a build step.
Performance measured against a dev server is meaningless — the same Vite + React app
weighs 3.58 MB in dev and 0.09 MB built — so anything weight- or speed-related has to be
measured on the built output. Behaviour and accessibility are fine to check on the dev
server.

**`budgets`** — the project's own limits, which replace the auditor's judgement about
what counts as too heavy or too slow. **Measure them against the production build**, never
the dev server, or the weight budget fails by a factor of forty for no reason. Free-form: declare only what matters here. A 3D
experience might legitimately set `pageWeightMB: 45` where a landing page sets `2`.
Each declared budget is measured and rendered as a pass/fail row in the report, which
also turns it into a regression guard — a jump from 4 MB to 6 MB gets flagged even though
6 MB is not obviously wrong on its own.

**`routes`** — the pages worth sweeping. Keep the list short and representative: one of
each *kind* of page beats every page of one kind. `requires` names a precondition
(usually a saved state from a flow checkpoint) so the route is skipped, not failed, when
it is unavailable.

**`chapters.route`** — which route the chapter runs on. Omit it for a single-page project.

**`chapters.steps`** — intent, in prose, not literal shell commands. The point is to
re-run the same *coverage* while adapting to a DOM that has changed since the plan was
written. Flows are the opposite: literal and replayable.

**`knownIntentional`** — the highest-value field over time. Every deliberate behaviour
that once looked like a bug goes here, so the same false positive is never investigated
twice. Append to it whenever a run rules something out.

## Fixtures

Named test data, referenced as `{{name}}` inside flow action values. Without them the
auditor invents values that may collide with existing records or fail validation.

`{{run}}` inside a fixture value is replaced with a per-run timestamp, so re-running a
flow that creates something does not collide with what the last run created. It works in
any position: `qa+{{run}}@x.test`, `{{run}}-bot`, `order-{{run}}`.

Never put real credentials here — this file lives in the repo. Point at a staging account.

## Safety

**`mock`** — URL patterns whose responses are faked, so the client side can be exercised
without the side effect. Applied by default to every flow that declares them; the report
must state which submissions were mocked, otherwise it implies a real end-to-end pass.

**`neverSubmit`** — selectors the auditor must not submit under any circumstances, even
when asked to test them. For anything that sends real mail, charges a card, or writes to
production.

## Flows

A flow is an ordered, literal sequence — the answer to "test my four-step checkout". It
differs from a chapter in three ways: steps run in order and later steps depend on
earlier ones, each step carries an expectation, and the whole thing is replayable.

**`steps[].actions`** — `do` is one of `goto`, `click`, `dblclick`, `fill`, `type`,
`press`, `select`, `check`, `uncheck`, `hover`, `upload`, `scroll`, `wait`. `target` is a
CSS selector or a Playwright locator expression (`getByRole('button', { name: 'Next' })`).
`value` supports `{{fixture}}` substitution.

**`steps[].code`** — the Playwright lines playwright-cli emitted while the step actually
ran, captured verbatim from its `### Ran Playwright code` output. When present the spec
generator uses these instead of mapping `actions`, which is strictly better: acting on a
ref yields `getByRole('textbox', { name: 'Email' })` where a CSS selector yields
`locator('#email')`. Keep `actions` too — it stays readable and is the fallback.

**`steps[].expect`** — what must be true once the step's actions have run. Supported:
`visible`, `hidden`, `url` (globs allowed), `title`, `text` (`{target, value}`),
`count` (`{target, value}`), `focused`, `enabled`, `disabled`. **A step without an
expectation proves nothing** — the spec generator emits a TODO for it.

**`steps[].checkpoint`** — saves browser state to `.qa-live/state/<name>.json` after the
step succeeds.

What it captures is **cookies and storage, and nothing else**. That makes it a real
speed-up when the progress lives there: an authenticated session, or a wizard that saves
its draft to `localStorage`. It does *not* restore a wizard whose step state lives only
in the DOM — loading it gives you a logged-in browser sitting back at step one. On a
DOM-only flow the checkpoint file comes back as `{"cookies":[],"origins":[]}`, which is
the tell.

So place checkpoints where state actually persists — right after login, above all. Skipping
authentication on every iteration is where the time really goes on a long flow.

When a step fails, the flow stops there. Report *which* step broke and the state at that
point — "blocked at step 3 of 4" is actionable, "the form is broken" is not.

## Reusing a plan

Load it, tell the user which plan is being reused and when it was created, then run it.
Re-run recon instead if the project changed materially — new routes, a different
framework, chapters whose selectors no longer resolve. Rewrite the plan afterwards.
