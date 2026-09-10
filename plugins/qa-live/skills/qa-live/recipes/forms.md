# Recipe — forms

Load when recon finds a `<form>`, or inputs that submit something: contact, sign-up,
sign-in, search, checkout, newsletter.

**Never submit a form that sends real mail, charges a card, or writes to production.**
Ask first, or intercept the request with `playwright-cli route "<endpoint>" --status=200
--body='{}'` and test the client side against the mock. Say in the report which submissions
were mocked.

## Checks

**Labels** — every control needs a programmatic label: a `<label for>`, a wrapping
`<label>`, `aria-label`, or `aria-labelledby`. Placeholder text is not a label; it
disappears on focus and is invisible to some assistive tech. Walk the controls and list
the ones with no accessible name — this is the most common form defect and the easiest fix.

**Empty submission** — submit with everything blank. Something must happen: the browser's
own validation, or the app's. Silence is a defect. Note whether errors are announced
(`role="alert"` or `aria-live`) or only shown visually, and whether focus moves to the
first offending field.

**Invalid input** — a malformed email, a too-short password, letters in a number field.
Check that the message says what to do rather than what went wrong, that
`aria-invalid="true"` is set, and that the message is linked with `aria-describedby`.

**Error styling** — colour alone is not enough to signal an error (WCAG 1.4.1). There must
be text, an icon, or a border change too. Measure the error text's contrast with
`qa.contrast` — red on white is often below 4.5:1.

**Recovery** — fix an invalid field and confirm the error clears. Errors that persist after
correction are a common and infuriating bug.

**Keyboard only** — tab through the whole form, fill it, submit with Enter, never touching
the mouse. Check the tab order follows the visual order and that the focus indicator is
visible on every control. This catches custom selects and date pickers that are mouse-only.

**Autofill and types** — `type="email"`, `type="tel"`, and `autocomplete` attributes
(`email`, `given-name`, `current-password`…) change the mobile keyboard and let password
managers work. Their absence is a quiet friction cost worth an `info`.

**Double submission** — click submit twice quickly. The button should disable or the
request should be de-duplicated. Worth checking whenever a submission creates something.

**State after submit** — success must be announced, not just styled. And if the form is
long, check whether an error round-trip preserves what the user typed.

## Worth praising when present

Every control labelled · errors announced with `role="alert"` · focus moved to the first
error · `autocomplete` set · submit disabled while pending · errors clearing on correction.
