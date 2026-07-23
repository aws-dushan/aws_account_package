# Design System

Brand from the logo: **AWS Orange `#EE7623`** (accent, used sparingly) + **Deep Indigo `#2E2C7B`**
(structure/headers). Neutrals biased slightly toward indigo. UI is animated (Framer Motion),
light + dark, WCAG AA, respects `prefers-reduced-motion`.

## Severity colour system (pastel fill + saturated ink + icon + label)
Colour is **never the only signal** — always paired with an icon and a word, so it survives
greyscale and print. All pairs validated (WCAG contrast + colour-blindness separation).

| Severity | Icon | Fill (light) | Ink | Border | Meaning |
|---|---|---|---|---|---|
| Green  | ✓ | `#E3F5E4` | `#1B7A2E` | `#A8DDB0` | Reconciled / self-cancelling — no action |
| Amber  | ▲ | `#FFF3D6` | `#8A5A00` | `#F5DFA0` | Requires posting by one party (agreed) |
| Coral  | ● | `#FCE6DC` | `#A8481A` | `#F3C3AC` | Amount difference — verify & adjust |
| Red    | ✕ | `#FBE0E0` | `#A62828` | `#F0B4B4` | Dispute / document exchange |
| Grey   | – | `#EEEDEA` | `#565550` | `#D9D7D1` | Immaterial (rounding / fils) |
| **Violet (AI only)** | ✦ | `#ECE7FB` | `#463499` | `#CFC4F0` | AI insight — generated only for rule-failures |

Violet is **reserved for AI** and never used for a data category.

## Category (chart identity) palette
Validated 4-set, direct-label the segments: blue `#2a78d6`, aqua `#1baf7a`, yellow `#eda100`,
magenta `#e87ba4`. (Never place red next to magenta — fails the normal-vision separation floor.)

## Type
Restrained serif for statement mastheads/figures (audited-statement gravitas); system sans for UI;
`tabular-nums` wherever digits align in columns.

## Reference implementations already built
- Approved output UI (dashboard + exception queue + report) — see the published artifact
- Colour-coded Excel export generator (exceljs) → becomes the Phase 2 export module
