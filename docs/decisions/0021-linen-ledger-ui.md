# 0021. Linen ledger look on the Angular CDK, without Material components

- Status: Accepted
- Date: 2026-10-07
- Supersedes: the "Components and theme" part of [0020](0020-web-ui-foundation.md)

## Context

Selah's theme is a retreat from busy life to get ready for the next round. The first build used Angular Material ([0020](0020-web-ui-foundation.md)), and its floating labels, ripples and motion felt too modern and technical for that. The owner compared three calm directions and chose **C · Linen ledger**: an old ledger book on oatmeal paper.

## Decision

**The look**

- **Colours:** oatmeal paper `#EEE9DF`, a lighter panel `#F4F0E8`, ink `#2F2C27`, muted ink `#6A6458`, rules `#9E9686` and `#B9B1A2`, and one sage accent `#56705A`. Errors use a muted brick `#9B4A3A`. The app is light only for now.
- **Type:** Libre Caslon Text (often italic) for titles and section headings, Karla for text and controls, and IBM Plex Mono for every amount, like a typewritten ledger.
- **Details:** a double rule under page headers, dotted leaders between a name and its amount, dashed boxes for envelopes and the amount field, small square checkboxes, and done items crossed out.
- **Forms:** a label always visible, above the field or to its left in a ledger row. Nothing floats, ripples or animates. Inputs are native, so phones show their own date and select pickers.
- **Dialogs** open full screen on phones, with Cancel, the title and Save in the header.

**Components**

- `@angular/material` is removed. The **Angular CDK** stays for behaviour without a look: dialogs, overlays, focus trapping and other accessibility.
- Our own small set lives in `apps/web/src/app/ui/`: an icon component (inline stroke SVGs) and a toast service. Global classes in `styles.scss` cover buttons, fields, ledger rows, segmented toggles, checkboxes and cards.
- Every colour, font and size is a CSS custom property on `:root`. Components use the tokens, never raw values.

The i18n, structure, money and dates decisions in [0020](0020-web-ui-foundation.md) stay as they are.

## Consequences

- The app has its own quiet character, and the bundle is smaller without Material.
- We own accessibility details that Material provided, such as focus styles, touch targets of at least 44 px, and contrast. The CDK covers the hard parts: dialog focus and screen-reader behaviour.
- Because the look lives in tokens, another theme later (the Paper and Evening directions from the comparison) would mean a second set of token values, not new components.
