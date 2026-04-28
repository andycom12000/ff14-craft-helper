---
name: 吐司工坊 · Toast Workshop
description: A bakery-warm crafting workshop for FFXIV — light theme, multi-color jam-jar semantic palette, editorial serif accents.
colors:
  toast-gold: "oklch(0.65 0.18 65)"
  toast-gold-light: "oklch(0.78 0.15 75)"
  toast-gold-glow: "oklch(0.65 0.18 65 / 0.18)"
  toast-crust: "oklch(0.59 0.10 50)"
  cocoa: "oklch(0.50 0.16 40)"
  strawberry-jam: "oklch(0.58 0.20 15)"
  matcha: "oklch(0.62 0.17 135)"
  buff-info: "oklch(0.50 0.13 70)"
  cream-bg: "oklch(0.965 0.022 90)"
  cream-sidebar: "oklch(0.93 0.025 80)"
  cream-surface: "oklch(0.975 0.018 85)"
  cream-surface-2: "oklch(0.93 0.04 80)"
  cream-hover: "oklch(0.94 0.025 85)"
  ink-primary: "oklch(0.28 0.04 55)"
  ink-muted: "oklch(0.50 0.03 60)"
  border-default: "oklch(0.65 0.04 65 / 0.30)"
  success: "oklch(0.55 0.16 145)"
  warning: "oklch(0.58 0.17 45)"
  danger: "oklch(0.55 0.20 25)"
  state-good: "oklch(0.62 0.18 60)"
  state-poor: "oklch(0.55 0.20 15)"
typography:
  display:
    fontFamily: "'Cormorant Garamond', 'Noto Serif TC', serif"
    fontSize: "clamp(40px, 7vw, 64px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.015em"
    fontStyle: "italic"
  headline:
    fontFamily: "'Noto Serif TC', serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.01em"
  title:
    fontFamily: "'Noto Serif TC', serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0"
  body:
    fontFamily: "'Noto Sans TC', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0"
  body-serif:
    fontFamily: "'Noto Serif TC', serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.85
    letterSpacing: "0"
  label:
    fontFamily: "'Fira Code', 'JetBrains Mono', ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.25em"
    textTransform: "uppercase"
  mono:
    fontFamily: "'Fira Code', 'JetBrains Mono', ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.toast-gold}"
    textColor: "{colors.cream-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.toast-gold-light}"
    textColor: "{colors.cream-surface}"
  button-ghost:
    backgroundColor: "{colors.cream-hover}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  card:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "18px"
  input:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "36px"
  chip-active:
    backgroundColor: "{colors.toast-gold}"
    textColor: "{colors.cream-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-default:
    backgroundColor: "{colors.cream-hover}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  pill-eyebrow:
    backgroundColor: "{colors.toast-gold-glow}"
    textColor: "{colors.toast-gold}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
---

# Design System: 吐司工坊 · Toast Workshop

## 1. Overview

**Creative North Star: "The Morning Bakery"**

吐司工坊是一間早晨剛開門的麵包店：陽光從側窗灑進來、烘焙紙、玻璃果醬罐排成一列、剛揉好的麵糰在木桌上，櫃台上有一塊手寫黑板。這個系統的所有視覺決策都從這個物理場景延伸：cream 色主背景是早晨的烘焙紙，吐司金強調色是櫃台燈下的麵包邊緣，多色語意（可可 / 草莓醬 / 抹茶）是排隊的果醬罐，Cormorant italic 是黑板上的手寫引言。

吐司工坊**拒絕**同類 FFXIV 工具的 dark navy / purple gradient 配色（tnze.yyyy.games、beherw FFXIV_Market 都是反例）。它拒絕「冷冰冰的科技工具」氣氛，拒絕「凌晨工程師專用 dashboard」的視覺常規。它的個性是**溫暖、親切、輕鬆**，加上一點手藝人的低調自豪——像麵包師傅介紹今天的麵包，貼心、有人氣，不冷不謙卑也不炫耀。

主打功能是「批量製作」（Batch Crafting）；視覺權重也跟著走：Dashboard 把它做成 hero 切片區塊，sidebar 把它放在 Tier 1。

**Key Characteristics:**

- **Light first**：奶油白 cream 主背景貫穿整站，dark mode 是 v2.3.0 才加的次要 mode（深暖灰 + 暖棕 sidebar，不是冷藍）。
- **Full palette 多色語意**：四種烘焙食物色（吐司金 / 可可 / 草莓醬 / 抹茶）對應四個產品功能，使用者一眼能辨方位。
- **Editorial serif accents**：Cormorant Garamond italic 用於 hero / 引言 / 月份標題；Noto Serif TC 撐起標題與部分 body；Noto Sans TC 撐起 UI body；Fira Code 用於版本號 / 日期 / eyebrow。**四軌字體分工嚴格**。
- **手作感無傾斜**：hover 微抬升、紙質紋理、Cormorant italic 引言；**從不傾斜任何元件**（避免「歪」感）。
- **流程精簡**：每頁完成一件事的完整流程，避免使用者在頁面間來回跳轉。

## 2. Colors

The palette is a row of jam jars on a sunlit bakery counter: one signature crust gold, three full-saturation jam hues for functional zones, and a stack of cream tones for surfaces. No gray neutrals. Every "neutral" is tinted toward warm 55-90 hue.

### Primary

- **Toasted Crust Gold** (`oklch(0.65 0.18 65)`): The single brand accent. Used for primary CTA, focus rings, active sidebar items, eyebrow micro-labels, and the gold underline that introduces the latest version on the Changelog page. Hover state lifts to `oklch(0.78 0.15 75)`.
- **Toasted Crust Gold (Glow)** (`oklch(0.65 0.18 65 / 0.18)`): The same hue at 18% alpha. Used as background wash on active sidebar item, on focus rings, and in any "this is selected" indication. Never as a fill on resting elements.
- **Bread Crust Brown** (`oklch(0.59 0.10 50)`): A deeper crust tone reserved for the Dashboard "批量製作" hero edge. Pairs with `toast-gold-glow` to create the warm-loaf gradient.

### Functional (the jam-jar row)

These are not interchangeable. Each maps to a single product surface and never appears outside it.

- **Cocoa Bark** (`oklch(0.50 0.16 40)`) — **Crafting** (gearsets, simulator, batch, BOM). The largest functional area. Use as text accent on craft-related labels, as outline ring on craft-themed selectors, and as `dim` (10% alpha) background wash on craft hover state.
- **Strawberry Preserve** (`oklch(0.58 0.20 15)`) — **Market**. Reserved for market price views and any "current market data" affordance. Never used elsewhere.
- **Garden Matcha** (`oklch(0.62 0.17 135)`) — **Gathering Timer**. The full hue rotates: light timer cards, alarm UI, gather-related menu badges.
- **Buff Info Gold** (`oklch(0.50 0.13 70)`) — **Buff / hint annotations**. Slightly warmer/duller than the primary crust; used for inline hints, "did you know" cards, and tooltip-style asides.

### Neutral (the cream stack)

Every "background" is a tinted cream, never gray, never `#fff`.

- **Bakery Cream** (`oklch(0.965 0.022 90)`): Page background. The most-cream tint of the stack.
- **Cream Sidebar** (`oklch(0.93 0.025 80)`): Sidebar surface, one tonal step warmer/darker than page bg.
- **Cream Card** (`oklch(0.975 0.018 85)`): Default card / panel surface. Almost-white, holds an icon of warmth.
- **Cream Emphasis** (`oklch(0.93 0.04 80)`): Hero / batch banner background, two steps deeper than card so it reads as a featured zone.
- **Cream Hover** (`oklch(0.94 0.025 85)`): Hover wash on rows, list items, ghost buttons.
- **Border Default** (`oklch(0.65 0.04 65 / 0.30)`): The single border token. 1px, warm-tinted, never gray.

### Text

- **Ink Brown** (`oklch(0.28 0.04 55)`): Primary text. Deep warm brown, never `#000` or pure black.
- **Ink Muted** (`oklch(0.50 0.03 60)`): Secondary copy, captions, hints.

### Semantic

- **Verdant Success** (`oklch(0.55 0.16 145)`): Success states only.
- **Bake Warning** (`oklch(0.58 0.17 45)`): Warning states. **Distinct hue from primary** so warning alerts and warning buttons stay visually distinguishable from CTAs.
- **Singed Danger** (`oklch(0.55 0.20 25)`): Destructive actions, errors.

### Named Rules

**The Jam-Jar Rule.** Each functional hue (cocoa, strawberry, matcha, buff-info) belongs to exactly one product zone. Never use cocoa on a market screen, never use strawberry on a craft screen. The hue IS the wayfinding signal.

**The Sunlight, Not Spotlight Rule.** Toast-gold is used for ≤10% of surface on any given screen. It's the primary CTA, the focus ring, the active state — not a decoration. Its rarity makes it readable.

**The No-Gray Rule.** Every neutral tints toward warm 55-90 hue with chroma 0.018-0.04. Pure gray (chroma 0) is forbidden. White and black are forbidden — `#fff` and `#000` never appear in code.

## 3. Typography

**Display Font:** Cormorant Garamond (with Noto Serif TC fallback for CJK).
**Body Serif:** Noto Serif TC.
**Body Sans:** Noto Sans TC (with system fallback).
**Mono:** Fira Code (with JetBrains Mono fallback).

**Character:** Four tracks, strict division of labor. Cormorant italic is the bakery blackboard chalk — only for hero, eyebrow quotes, codenames, month markers. Noto Serif TC carries section titles and book-page prose. Noto Sans TC carries every UI label, button, table cell, form. Fira Code carries every number, version, date, timestamp.

### Hierarchy

- **Display** (Cormorant italic, 500, `clamp(40px, 7vw, 64px)`, line-height 1, letter-spacing -0.015em): Page-level eyebrow titles, Changelog "更新日誌" heading, Dashboard "歡迎回來" greeting. Italic is mandatory; the slant is the bakery handwriting.
- **Headline** (Noto Serif TC, 700, 28px, line-height 1.15): Page H1. "更新日誌", "製作模擬", "設定".
- **Title** (Noto Serif TC, 600, 17px, line-height 1.4): Section titles inside a page; hero highlight category headings on Changelog.
- **Body** (Noto Sans TC, 400, 15px, line-height 1.7, max 65–75ch): Default UI body. Buttons, cells, form labels, tooltips.
- **Body Serif** (Noto Serif TC, 400, 15px, line-height 1.85): Reserved for editorial reading surfaces — Changelog hero highlights, About-page paragraphs, quotes. Wider line-height than sans body so it reads "book-page".
- **Label** (Fira Code, 500, 11px, letter-spacing 0.25em, UPPERCASE): Eyebrow micro-labels above hero / section. "VIII · CHANGELOG", "POWERED BY", "CRAFTED BY".
- **Mono** (Fira Code, 500, 12-13px, letter-spacing 0.04em): Version numbers, dates, gil amounts, anything numeric.

### Named Rules

**The Four-Track Rule.** Every text element belongs to exactly one of the four font families: Cormorant (display / italic accents), Noto Serif TC (titles / editorial), Noto Sans TC (UI body), Fira Code (numbers / mono). Mixing within an element (Cormorant inside a button label) is forbidden.

**The Italic-Is-Sacred Rule.** Cormorant Garamond italic is reserved for moments — page eyebrow titles, version codenames in quotes (`"Toast Workshop"`), month markers in archive ledgers, taglines like *"今天想烤點什麼？"*. Never as body text, never as button label, never inside dense data tables.

**The 65-Character Rule.** Body text caps at 65–75ch measure. The Changelog page's container narrows to 920px specifically to honor this for the editorial body-serif highlights.

## 4. Elevation

The system is **hybrid**: flat at rest, lifted on response, ambient on hero.

Surfaces use **tonal layering** as the default depth language: page bg `oklch(0.965)` → sidebar `oklch(0.93)` → card `oklch(0.975)` → emphasis `oklch(0.93)`. The stack of cream tones tells the eye which surface is in front without ever drawing a shadow.

Shadows enter only when an element **changes state** (hover lift, focus ring), or when an element is **genuinely floating** (dropdown, popover, dialog, mobile drawer). They do not decorate resting cards or panels.

Hero zones (Dashboard "批量製作" slice, Changelog hero, batch onboarding) earn one extra layer: a low ambient shadow plus a `--paper-noise` radial-dot pattern at 5% opacity, evoking a faint paper grain. This is the only place where elevation is "for atmosphere" rather than for state.

### Shadow Vocabulary

- **Hover Lift** (`box-shadow: 0 2px 8px color-mix(in srgb, var(--app-accent) 18%, transparent)`): Cards, ghost buttons, ledger rows. Combined with `transform: translateY(-1px)` for the bakery-tray pickup feel.
- **Hero Ambient** (`box-shadow: 0 4px 18px oklch(0.40 0.05 60 / 0.06)`): Dashboard hero, Changelog hero panel. Soft warm-brown wash, low alpha; reads as morning-light glow, not a drop shadow.
- **Floating Element** (`box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4)`): Dialogs, dropdowns, mobile drawer overlays. The only shadow heavy enough to read as "in front of everything."
- **Inset Highlight** (`box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.6)`): A 1px white-ish inner top stroke on hero cards and Changelog panels. The soft top-edge of a paper sheet catching window light.

### Named Rules

**The Flat-Until-Touched Rule.** Cards, panels, list rows, sections do NOT carry shadow at rest. The first shadow appears as a hover or focus response. Anyone who adds a resting shadow to a list row is wrong.

**The Hero-Earns-Atmosphere Rule.** Hero zones (one or two per page, max) may layer ambient shadow + paper-noise + inset highlight together. Outside heroes, paper-noise is forbidden; outside heroes, ambient shadow is forbidden.

**The Floating-Is-Heavy Rule.** Dropdowns, popovers, dialogs, mobile drawers carry a clearly heavier shadow (16-48px blur, 0.4 alpha). Visitors must read these as "in front of everything else", not as another panel.

## 5. Components

Components are **tactile and confident**. Corners are clearly rounded (8-14px), CTAs are filled-color and unmistakable, hover lifts 1-2px with a soft glow. The "feel" is "you can press this", not "this is delicate, please be careful".

### Buttons

- **Shape:** rounded 8px (md). Pills (999px) only for chips and small toggles.
- **Primary** (Toast Gold fill, 10px × 18px padding, body-weight label): The single CTA on most surfaces. Used for "開始規劃", "啟動求解", "套用", "新批次". Hover lifts to gold-light, shifts up 1px, picks up `0 2px 8px` accent-tinted shadow.
- **Secondary / Ghost** (transparent or `cream-hover` fill, 8px × 14px): Cancel, "更多選項", inline tools. Hover wash to `cream-hover`, no lift.
- **Destructive** (Singed Danger fill, same shape as primary): Reserved for "刪除", "全部清除". Always behind a confirm.
- **Focus:** 2px solid Toast Gold outline at 3px offset. Same on every button, so keyboard users navigate predictably.

### Chips / Pills

- **Shape:** Pill (999px). Padding 6px × 12px (eyebrow micro-labels: 3px × 10px).
- **Active**: Toast Gold background + cream-surface text. Used for the active language pill, active filter, active condition selector.
- **Default**: cream-hover background + ink-muted text. Hover lifts text to ink-primary.
- **Eyebrow** (a special case): Toast Gold glow background (18% alpha) + Toast Gold text + Fira Code label typography. Reserved for category eyebrows above hero titles.

### Cards / Panels

- **Corner:** 14px (lg). Larger than buttons by design — cards feel like ceramic plates, buttons feel like printed labels.
- **Background:** Cream Card by default. Cream Emphasis only for hero panels.
- **Border:** 1px Border Default, always.
- **Shadow at rest:** None. (See "Flat-Until-Touched Rule".)
- **Internal padding:** 18px on desktop, 14px on mobile. Hero panels: 24-32px.
- **Hover (when interactive):** lift 1-2px + Hover Lift shadow.

### Inputs / Fields

- **Shape:** 8px radius (md), 36px height.
- **Background:** Cream Card.
- **Border:** 1px Border Default at rest, shifts to Toast Gold on focus + 2px Toast Gold outline at 3px offset.
- **Mono numerics:** Fira Code on any numeric input (`+/-` steppers, gil totals).

### Navigation (Sidebar)

- **Shape:** 220px wide on desktop; mobile drawer with 36px close button absolute top-right.
- **Logo header:** "吐司工坊" Noto Serif TC 900 19px + "FFXIV 製作助手" 9.5px uppercase mono-feel sub-line + a single 32×32 theme toggle (sun/moon) at top-right of the header.
- **Menu items:** 44px tall, 14px font, ink-muted by default, ink-primary on hover with `oklch(0.65 0.18 65 / 0.10)` toast-gold wash. Active item: Toast Gold Glow background + Toast Gold text + 700 weight.
- **Footer:** Locale pill group (繁中/简中/EN/JA) + Eorzea Time / Local Time clock.

### Signature: Editorial Hero Pattern

Used on Dashboard's batch-craft slice and Changelog's "本期" panel. Pattern is:
1. Cormorant italic eyebrow micro-label in Toast Gold ("VIII · CHANGELOG", "本期 · April · 四月").
2. A large display title (28-64px) with optional codename in Cormorant italic in muted text.
3. A 1px gold rule that runs partly across the panel (`linear-gradient(90deg, gold 0 56px, border 56px 100%)`), like a chalk underline on a blackboard.
4. Editorial body-serif content underneath (Noto Serif TC, 1.85 line-height).
5. Optional paper-noise texture on the page background, never inside the panel.

### Mobile App Bar

- **Shape:** 52px height, fixed top, full-width.
- **Content:** hamburger menu icon (left) + page H1 title (Noto Serif TC, 700, 18px) + teleport slot for page-specific tools (right).
- **Background:** Cream BG with 82% color-mix backdrop blur for sticky offset compatibility.

## 6. Do's and Don'ts

### Do:

- **Do** keep Toast Gold under 10% of any given screen — primary CTA, focus, active state, nothing more.
- **Do** map every functional zone to its assigned jam-jar hue: Crafting → Cocoa, Market → Strawberry, Gathering → Matcha. Hue is wayfinding.
- **Do** lead Cormorant italic with "italic intent": eyebrows, quotes, version codenames, month markers — moments only.
- **Do** keep cards flat at rest. Lift them 1-2px with a 0 2px 8px accent-tinted shadow only on hover.
- **Do** use OKLCH for every color value. Hex is forbidden in source CSS unless required by an external library config.
- **Do** tint every neutral toward warm 55-90 hue; pure gray and `#fff`/`#000` are forbidden.
- **Do** cap body line-length at 65–75ch. The Changelog page is the canonical reference (920px container).
- **Do** use Fira Code for every number, version, date, gil amount.
- **Do** keep dark mode warm: deep brown surfaces (oklch ~0.18-0.22 L, hue 60), warm cream text (oklch ~0.94 L, hue 80). Never cool blue/gray.

### Don't:

- **Don't** use dark navy or purple gradients. tnze.yyyy.games and beherw FFXIV_Market are the named anti-references; this system exists to differentiate from them.
- **Don't** use neon accents or glassmorphism on dark mode. Dark mode is a "lamp at midnight workshop", not a "sci-fi cockpit".
- **Don't** put Cormorant italic inside dense UI: buttons, table cells, form labels, dropdown items are forbidden zones for it.
- **Don't** mix font families inside a single text element ("吐司工坊 v2.4.0" must not put "吐司工坊" in Noto Serif TC and "v2.4.0" in Fira Code in the same span without a deliberate split).
- **Don't** apply `border-left` greater than 1px as a colored stripe. Use full borders, background tints, or leading icons instead.
- **Don't** use `background-clip: text` with a gradient (gradient text). One solid color, emphasis via weight or size.
- **Don't** add resting shadows to cards, list rows, panels. The Flat-Until-Touched Rule applies.
- **Don't** use the SaaS hero-metric template (big number + small label + supporting stats + gradient accent).
- **Don't** stack identical cards in a grid. The Dashboard tier-2 tools row deliberately varies card sizes; identical-card grids are the AI-slop fingerprint.
- **Don't** use modals as a first thought. Inline expansion (Changelog ledger row click), bottom sheets (mobile skill picker), and side panels are exhausted before reaching for a dialog.
- **Don't** put `#fff` or `#000` in code. Every color is OKLCH, every neutral is tinted toward warm 55-90 hue.
- **Don't** localize away the bakery metaphor. Even when copy must be terse and technical, the visual stays warm and crafted, not cold.
