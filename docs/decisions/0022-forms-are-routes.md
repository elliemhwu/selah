# 0022. Forms are routes, shown full screen on phones and as a column on laptops

- Status: Accepted
- Date: 2026-10-07
- Supersedes: the dialog rules in [0020](0020-web-ui-foundation.md) and [0021](0021-linen-ledger-ui.md)

## Context

The first screens opened their forms in CDK dialogs. In a PWA, a web modal misses what a native sheet gets from the system. The back gesture leaves the page underneath and loses the entry, a reload throws the form away, there is no URL to link to, and nested forms stack badly. The budget editor will need forms inside forms. Selah is mainly used on a phone, but may be used on a laptop too.

## Decision

- **Every form is a route.** Examples: `/records/new?type=&item=&amount=`, `/records/batch?items=`, `/accounts/new`, `/accounts/:id`, `/accounts/transfer?from=`, `/accounts/adjust?account=`. A form reads its starting values from the route and loads what it needs itself, so a reload or a shared link opens the same form.
- **Leaving a form** (Save or Cancel) goes back in history when the user came from inside the app, and otherwise to the form's parent screen (`FormNavigation.leave`). The screen underneath reloads its data when it is shown again. Toasts confirm saves.
- **Presentation adapts; behaviour doesn't.** Form routes carry `data: { form: true }`. The shell then hides the bottom navigation, and the form fills the screen on a phone, with Cancel, the title and Save in its header. On a wide screen the same route is a centred column about 560 px wide. A side panel next to a list can come later as a layout change.
- **Overlays** are kept for small choices with no typed input, such as confirmations and short pickers. Delete confirmation stays inline ("Tap again to delete").

## Consequences

- The back gesture, reload, links and browser history behave as people expect on a phone and a laptop.
- Forms can't receive objects from the screen that opened them. They take ids from the route and fetch the rest, so each one also handles "loading" and "not found".
- Tests drive forms through route parameters and a stubbed `FormNavigation`, with no dialog harness.
