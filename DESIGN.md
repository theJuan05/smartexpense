---
name: SmartExpense AI Pro
description: Personal finance tracker for young professionals, students, and families — built to coach, not to judge.
colors:
  momentum-violet: "#6c4fff"
  momentum-violet-dark: "#5538e8"
  momentum-violet-light: "#f0eeff"
  momentum-violet-mid: "#d4ccff"
  growth-green: "#0a8c5a"
  growth-green-light: "#edfaf3"
  growth-green-border: "#b3e8cc"
  alert-red: "#e74c3c"
  alert-red-light: "#fff0f0"
  caution-amber: "#f59e0b"
  caution-amber-light: "#fff8e1"
  surface-page: "#f0f0ff"
  surface-card: "#ffffff"
  surface-deep: "#1a1a2e"
  text-primary: "#1a1a2e"
  text-secondary: "#4a4a6a"
  text-muted: "#9a9ab0"
  text-faint: "#c0c0d8"
  border-default: "#e8e8f4"
  border-light: "#f4f4fc"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1.0
    letterSpacing: "-1.5px"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-1px"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.88rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.65rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.7px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "18px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.momentum-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.momentum-violet-dark}"
  button-success:
    backgroundColor: "{colors.growth-green-light}"
    textColor: "{colors.growth-green}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-danger:
    backgroundColor: "{colors.alert-red-light}"
    textColor: "{colors.alert-red}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "20px 22px"
  input:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "10px 13px"
---

# Design System: SmartExpense AI Pro

## 1. Overview

**Creative North Star: "The Clarity Coach"**

SmartExpense AI Pro is built for people who don't feel confident about money yet — young professionals watching their first paycheck disappear, students trying to make rent, families deciding what to cut. The interface must feel like a knowledgeable friend: warm enough to not make them feel judged, structured enough to actually help them improve. Every screen earns trust before it earns compliance.

Density is intentional: enough information to be useful in a 30-second check-in, nothing that overwhelms on first visit. Cards group related data without nesting. Purple anchors the experience as a signal of clarity and focus — not luxury, not technicality, just "this is the thing you pay attention to." White space is generous; the interface breathes. Progress (health scores, budget bars, trend lines) is always the hero; raw data is secondary.

This system explicitly rejects the corporate gray of enterprise finance tools (Quickbooks, SAP), the data-wall anxiety of Bloomberg and old Mint, and the aggressive neon energy of crypto and trading apps. It also refuses generic bank-app blandness — sterile white with navy headers and zero personality. The Clarity Coach does not look like a bank. It looks like something a 26-year-old would actually use every day.

**Key Characteristics:**
- Purple-tinted neutrals — even the page background carries a faint violet tint (#f0f0ff), keeping surfaces warm rather than cold
- Progress-first hierarchy — health scores, budget bars, and trend lines are primary; raw data is secondary
- State-responsive elevation — shadows appear as feedback to interaction, not decoration at rest
- Mobile-first density — everything works at 375px without horizontal scroll or pinch-zoom
- Dark mode as first-class — full parallel token set, not an afterthought

## 2. Colors: The Momentum Palette

A violet-anchored palette where color signals progress and action, never decoration.

### Primary

- **Momentum Violet** (#6c4fff): The action color. Used on primary buttons, active tab indicators, focus rings, interactive accents, and the logo badge. Never decorative — its presence means "tap here" or "this is selected."
- **Momentum Violet Dark** (#5538e8): Hover and pressed state for primary actions. Slightly deeper, same energy.
- **Momentum Violet Light** (#f0eeff): Hover background for tabs and nav icons. Background tint behind the AI hint chip and active list items. Never used as text.
- **Momentum Violet Mid** (#d4ccff): Border accent in violet contexts — hover borders on stat cards, selected item outlines.

### Secondary

- **Growth Green** (#0a8c5a): Positive signal. Income indicators, success badges, synced status, budget well within limit, positive trend lines. Paired with Growth Green Light as a tinted background.
- **Growth Green Light** (#edfaf3): Background tint for success states and the success button variant.
- **Growth Green Border** (#b3e8cc): Border on success chips and status badges.

### Tertiary

- **Alert Red** (#e74c3c): Danger signal only. Overspent budgets, delete actions, error states. Alert Red Light (#fff0f0) pairs as its background tint.
- **Caution Amber** (#f59e0b): Near-limit budgets, pending sync badge, warnings. Caution Amber Light (#fff8e1) pairs as its background tint.

### Neutral

- **Midnight Ink** (#1a1a2e): Primary text and chart surface deep background. Carries a faint violet undertone — not pure black.
- **Dusk Ink** (#4a4a6a): Secondary body text, supporting labels.
- **Haze** (#9a9ab0): Muted text — timestamps, inactive tabs, secondary metadata.
- **Ghost** (#c0c0d8): Placeholder text, faint separators.
- **Violet Mist** (#f0f0ff): Page background. Purple-tinted — not white, not gray. Separates the page layer from card surfaces visually without a heavy border.
- **Cloud** (#ffffff): Card surfaces. Lifts off the page background naturally.
- **Border Default** (#e8e8f4): Subtle card and input borders. Purple-tinted, not gray.
- **Border Light** (#f4f4fc): Ultra-subtle row dividers and form field hover backgrounds.

### Named Rules

**The Violet Signal Rule.** Momentum Violet appears on exactly one interactive element per context — the active tab, the focused input, the primary button. Its scarcity is its meaning. If it appears everywhere, it means nothing.

**The Tinted Neutral Rule.** Every neutral in this system carries a faint violet undertone. Never use pure #000000, #ffffff, or gray-family (#888888, #cccccc). The tint is what keeps the interface feeling cohesive rather than assembled.

## 3. Typography

**Primary Font:** Inter (Google Fonts, weights 300–800), fallback: -apple-system, BlinkMacSystemFont, sans-serif

**Character:** A single-family system built entirely on Inter's weight range. Weight contrast does the work that a serif/sans pairing would do elsewhere. The tightest letter-spacing is reserved for the largest numbers; labels go uppercase with wide tracking to separate metadata from content.

### Hierarchy

- **Display** (800, 2.5rem, line-height 1.0, letter-spacing -1.5px): Balance hero — the primary financial number on the dashboard. One instance per screen. Tight tracking prevents large numbers from spreading.
- **Headline** (800, 1.75rem, line-height 1.1, letter-spacing -1px): Stat card values (income, expenses, savings). Big, bold, readable at a glance.
- **Title** (700, 1.05rem, line-height 1.3): Section context and modal headings where a text label carries structural weight.
- **Body** (400, 0.88rem, line-height 1.5): Expense descriptions, form field values, general content. Keep line length under 70ch.
- **Label** (700, 0.65rem, uppercase, letter-spacing 0.7px, line-height 1.2): Section headings inside cards, form field labels, tab bar text. All uppercase; wide tracking separates them from body copy.

### Named Rules

**The Weight-Contrast Rule.** At least a 200-unit weight gap between adjacent hierarchy levels. 800 headline into 400 body reads clearly. 600 into 500 does not.

**The Number-Tightening Rule.** Negative letter-spacing is reserved for numerical display only (-1px to -1.5px). Prose and labels never use negative tracking.

## 4. Elevation

Ambient violet-tinted shadows rather than neutral dark shadows. The philosophy is flat at rest, glowing on interaction — shadows are state feedback, not structural decoration.

### Shadow Vocabulary

- **Ambient** (`0 1px 4px rgba(108,79,255,0.06)`): Resting state for cards and the navbar. Barely visible — enough to separate surfaces without declaring depth loudly.
- **Lift** (`0 4px 16px rgba(108,79,255,0.1)`): Hover state for cards and stat boxes. Shadow intensifies and the violet tint becomes perceptible — the element feels responsive.
- **Float** (`0 8px 32px rgba(108,79,255,0.15)`): Active modals and raised panels. The loudest shadow in the system; used sparingly.

Dark mode replaces violet-tinted shadows with neutral dark shadows (rgba(0,0,0,0.3–0.5)), since the violet tint disappears against dark surfaces.

### Named Rules

**The State-Only Rule.** Elements do not receive shadow at rest unless they are interactive (cards, buttons, navbar). Static text blocks, dividers, and layout containers are always flat.

**The Glow-Not-Drop Rule.** Primary buttons carry a violet ambient glow (`0 2px 8px rgba(108,79,255,0.3)`) rather than a neutral drop shadow. The glow intensifies on hover. This distinguishes interactive controls from structural cards.

## 5. Components

### Buttons

Tactile and encouraging — clear states, satisfying press scale, violet glow on primary actions.

- **Shape:** Gently curved (8px radius — `var(--radius-sm)`)
- **Primary:** Momentum Violet (#6c4fff) background, white text, 10px 20px padding, violet ambient glow (`0 2px 8px rgba(108,79,255,0.3)`)
- **Primary Hover:** Momentum Violet Dark (#5538e8) background, translateY(-1px), stronger glow (`0 4px 16px rgba(108,79,255,0.4)`)
- **Active (all variants):** scale(0.97) — physical press feedback
- **Success:** Growth Green Light (#edfaf3) background, Growth Green (#0a8c5a) text, thin green border; fills to solid green on hover
- **Danger:** Alert Red Light (#fff0f0) background, Alert Red (#e74c3c) text, thin red border; fills to solid red on hover
- **Font:** Inter 600, 0.83rem

### Cards

The structural unit of the app. White surfaces that lift off the violet-misted page.

- **Corner Style:** Gently curved (14px — `var(--radius-lg)`)
- **Background:** Cloud (#ffffff)
- **Shadow Strategy:** Ambient at rest; Lift on hover
- **Border:** 0.5px solid Border Default (#e8e8f4) — hairline, not structural
- **Internal Padding:** 20px 22px
- **Card Heading:** 0.68rem, weight 700, uppercase, Haze color — accompanied by a 3px × 12px violet pill (::before) as a leading marker

### Inputs / Fields

- **Style:** Violet Mist (#f0f0ff) background, Border Default hairline border (0.5px), 8px radius, 10px 13px padding
- **Focus:** Border shifts to Momentum Violet (#6c4fff), background lifts to Cloud (#ffffff), 3px violet glow ring (`0 0 0 3px rgba(108,79,255,0.12)`)
- **Placeholder:** Ghost (#c0c0d8)
- **Label:** Label style — uppercase, 0.65rem, weight 700, Haze color

### Navigation

- **Navbar:** 58px tall, Cloud background, hairline bottom border (0.5px), Ambient shadow. Sticky at top; z-index 100.
- **Logo:** "SmartExpense AI Pro" at 0.95rem, weight 700, Midnight Ink; "Expense" word in Momentum Violet; preceded by a 28px violet badge (7px radius) with white "$" glyph (weight 800, 0.8rem)
- **Tab Bar:** 46px tall, Cloud background, hairline bottom border, sticky below navbar (top: 58px). Horizontally scrollable on mobile, no visible scrollbar.
- **Tab Button:** 0.68rem, weight 600, uppercase, letter-spacing 0.5px, Haze at rest; Momentum Violet on hover with Violet Light background tint; active state adds a 2px Momentum Violet bottom border and weight 700
- **Navbar Icon Buttons:** 32px square, 8px radius, Border Light background; hover: Violet Light background, Violet Mid border

### Stat Card

Three-panel dashboard summary (income, expenses, savings).

- Same card base (14px radius, Cloud background, hairline border, Ambient shadow)
- Hover: translateY(-2px), Lift shadow, Violet Mid border
- Bottom edge: 3px color strip (::after), zero side-radius, bottom-radius inherits from card — violet for income, green for expenses, amber for savings
- Value: Headline style (800, 1.75rem, -1px tracking)
- Label: Label style (700, 0.65rem, uppercase, Haze)

### Balance Hero

The primary financial number. One per session.

- Deep violet gradient background (`linear-gradient(135deg, #2d1b8a 0%, #1a1040 60%, #0d0d20 100%)`)
- Largest radius in the system (18px — `var(--radius-xl)`)
- Balance value in Display style (800, 2.5rem, -1.5px tracking) in white
- The only element that commands the full visual weight of a screen

## 6. Do's and Don'ts

### Do:
- **Do** use Momentum Violet (#6c4fff) on one interactive element per context at a time — the active tab, the focused input, the primary CTA. Its scarcity is its signal.
- **Do** tint every neutral toward violet. Never use pure gray (#888), pure white (#fff), or pure black (#000). The shared undertone is what makes the palette feel intentional.
- **Do** pair every color-coded status with a text label or icon shape. Sync badges, budget states, and health score tiers must be readable without color vision.
- **Do** keep body line length under 70ch. Financial information reads fastest in a narrower column.
- **Do** apply `transform: scale(0.97)` on button `:active` — it makes interactions feel physical.
- **Do** honor `prefers-reduced-motion` — suppress translateY lifts and reduce transition durations for users who need it.
- **Do** let cards breathe at 20px+ internal padding. Compressed cards feel like the corporate tools this product is explicitly not.

### Don't:
- **Don't** use Quickbooks/SAP visual language — no corporate gray (#cccccc, #f5f5f5) as primary surfaces, no dense form grids with 10+ fields visible at once.
- **Don't** build data walls. Bloomberg and old Mint failed everyday users by showing everything simultaneously. One primary insight per screen surface.
- **Don't** use aggressive crypto or trading aesthetics — no neon on dark (#00ff88, #ff00aa on #000), no price-ticker animations, no charts that look like TradingView.
- **Don't** ship generic bank-app blandness — sterile white with a navy header and zero personality is exactly what this product is not.
- **Don't** use `border-left` or `border-right` greater than 1px as a standalone colored stripe accent on list items or callouts. The card heading 3px pill (::before) is a documented existing pattern; migrate toward background-tint treatments on new components.
- **Don't** use gradient text (`background-clip: text` with a gradient fill). Emphasis belongs to weight and size.
- **Don't** animate layout properties (width, height, top, left, margin). Use transform and opacity only.
- **Don't** use bounce or elastic easing. Ease-out-quart or expo for all transitions.
- **Don't** reach for a modal as the first solution for any new interaction. The expense edit modal exists as a legacy pattern; prefer inline and progressive disclosure for new features.
