# Recipe — dialogs, modals, drawers, lightboxes

Load when recon finds a `<dialog>`, or a panel that opens over the page: modal, drawer,
sheet, lightbox, command palette, cookie banner.

Start with `qa.dialog(sel)` — it returns `role`, `aria-modal`, the label, where focus
landed, and the body/html overflow in one call.

## Checks

**Semantics** — a modal needs `role="dialog"` (or a native `<dialog>`) plus
`aria-modal="true"` and an accessible name via `aria-label` or `aria-labelledby`. Without
them a screen reader keeps announcing the page behind. This is the single most common gap,
and it is two attributes to fix, so report it precisely rather than vaguely.

**Focus, both directions** — the hard part, and the part worth checking carefully:

- on open, focus must move into the dialog (the close button or the first control);
- on close, focus must return to the element that opened it.

`qa.dialog(sel).focusInside` covers the first. For the second, note the trigger before
opening and compare `document.activeElement` after closing. An app that does both is doing
the difficult work well — say so, and it also tells the developer what not to break.

**Escape** — must close. Check whether the node is removed from the DOM or just hidden;
both are fine, but a node left in the DOM should also be removed from the accessibility
tree, not merely made invisible.

**Background scroll lock** — with the dialog open, `mousewheel` and re-read `window.scrollY`.
If it moves, the page is scrolling behind the overlay, and closing the dialog leaves the
user somewhere they did not expect. A `<body>` still at `overflow: hidden auto` is the
usual cause: only the horizontal axis is locked.

**Careful: this test misfires easily.** The wheel only scrolls the container under the
cursor. Run `qa.scroller()` first and move the mouse to the real scroller's centre —
otherwise a dialog with perfectly good scroll behaviour looks broken, and a long dialog
that genuinely cannot be scrolled looks fine.

**Focus trap** — press Tab repeatedly and confirm focus stays inside. Escaping into the
page behind is a real defect for keyboard users, though a milder one than no focus move
at all.

**Opening controls** — every trigger needs an accessible name. A row of icon buttons all
reading "button", or six cards whose buttons all say the same generic label, leaves a
screen-reader user with an undifferentiated list. Compare the triggers against each other,
not just individually.

## A trap in the tooling

Clicking a small control (checkbox, icon button) fails while a `highlight` overlay is
active: the overlay covers the actionability hit-test point and Playwright waits forever.
Hide the highlight before clicking. A widget that "does not respond to clicks" is far more
often this than a real bug — verify by dispatching the event in JS: if the handler fires,
the problem is your overlay.

## Worth praising when present

Escape closes · focus moves in and returns · scroll locked · close button labelled ·
native `<dialog>` used · the trigger's own state (`aria-expanded`) kept in sync.
