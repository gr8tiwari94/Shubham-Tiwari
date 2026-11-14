# Shubham-Tiwari – Ecomexperts hiring test

Shopify theme based on **Dawn 16.1.1** (the live theme of the test store).

## Branches
- `master` – the theme exactly as downloaded from the store.
- `development` – adds the **Gift Guide** page built from the Figma file.

## What was added (development branch)
| File | Purpose |
| --- | --- |
| `sections/gift-guide-banner.liquid` | Banner section, built from scratch. All texts editable in the customizer, animated button. |
| `sections/gift-guide-grid.liquid` | Grid section: 6 product blocks picked in the customizer, quick-view popup. |
| `assets/gift-guide-banner.css` | Banner styles (mobile-first, 750px breakpoint). |
| `assets/gift-guide-grid.css` | Grid + popup styles. |
| `assets/gift-guide-grid.js` | Vanilla JS popup: dynamic variants, AJAX add to cart, upsell rule. |
| `snippets/gift-guide-arrow.liquid` | Arrow icon used by the buttons. |
| `templates/page.gift-guide.json` | Page template that combines the two sections. |

### Upsell rule
When a variant with the options **Black** and **Medium** is added to the cart, the
**Soft Winter Jacket** is added too. Product and option values are section settings.

No jQuery – vanilla JavaScript only.
