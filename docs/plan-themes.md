# Theme feature: design and implementation plan

Status: proposal with the product owner's decisions applied (section 8). Planning only, nothing under `static/` has been changed.
Visual preview: open `docs/theme-preview.html` (double click, no network).
Palettes and contrast numbers are produced from one script (see "How the contrast was verified"), so the doc, the preview and the CSS blocks below are the same data.

## 1. Goals and design principles

1. **Default keeps today's look.** The present look becomes the theme `default` ("Teal Classic"). Every value equals today's literal except the small accessibility refinements the owner accepted (`--muted`, `--placeholder`, `--input-border`, and `--danger-text` for error text; section 3.3).
2. **Components contain no colour literals.** Every colour, shadow and scrim is a token; a theme is nothing but a block of custom properties. Adding a sixth theme later = one CSS block + one i18n key.
3. **Semantic over literal tokens.** `--on-primary` (not "white"), `--danger-text`, `--chip-official-*`, `--scrim`. Dark themes need to flip these independently, which is why `#fff` on `--primary` cannot stay hard-coded.
4. **Dark is built, not inverted.** Per Material, Primer, Atlassian and Apple HIG guidance: no pure black or pure white (we use `#0e1523` bg / `#e8edf6` text), elevation expressed by *lighter* surfaces (bg < surface < surface-2), desaturated and lighter accents (mint `#2dd4bf` instead of teal 700), shadows kept but deeper, and the filled-button label flips to dark ink.
5. **Accessibility is a gate, not a goal.** Each theme must pass WCAG 2.2 AA for text (4.5:1) and non-text UI (3:1) on every pair in section 4. Graphite targets AAA for body text.
6. **Distinct but family-related.** Same radii, spacing, typography and component shapes everywhere; only hue, temperature and contrast change. Each theme keeps a single brand hue + one accent + the same semantic status roles, so "danger" never depends on the brand hue (Ember is the one to watch, see risks).
7. **Client preference only.** Stored in `localStorage` (`innodigym_theme`); no API call, no account sync.

### Research notes (sources)

Searched during this work (summarised, not copied):
- Material Design dark theme: surface `#121212`-class dark grey instead of black, elevation = lighter overlay, avoid saturated colours, 15.8:1 body contrast. https://m2.material.io/design/color/dark-theme
- Radix Colors: a 12-step scale with fixed roles (1-2 app/subtle bg, 3-5 component bg/hover/active, 6-8 borders, 9-10 solid fills, 11 low-contrast text, 12 high-contrast text); steps 11/12 are guaranteed legible on step 2. Used as the mental model for `bg`/`surface`/`surface-2` (1-3), `border` (6), `border-strong` (7), `primary` (9-11), `text-2` (11) and `text` (12). https://radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Dark mode round-ups (elevation by lighter surfaces, desaturated accents, avoid pure black/white): https://uxplanet.org/8-tips-for-dark-theme-design-8dfc2f8f7ab6 , https://uxcel.com/blog/mastering-elevation-for-dark-ui-a-comprehensive-guide-342 , https://atmos.style/blog/dark-mode-ui-best-practices
- Well-known references used from prior knowledge (not re-fetched in this session; re-verify if you cite them): Apple HIG "Dark Mode" and "Color" (semantic colours, elevated base/secondary backgrounds, increased-contrast variants); GitHub Primer "Color: dark/dimmed/high contrast" (the idea of shipping a separate high-contrast theme); Atlassian design tokens "Elevation" and "Color" (surface raised/overlay, tokens named by role); Tailwind CSS v3/v4 palette (slate/teal/orange/blue/zinc ramps used as the starting hexes); W3C WCAG 2.2 SC 1.4.3, 1.4.11, 2.4.11/2.4.13 (focus). https://www.w3.org/TR/WCAG22/
- Fitness-app palette conventions (energetic saturated accent on a neutral surface, near-black dark mode with one bright accent, warm "sunrise" variants for morning-workout apps) informed Ember and Midnight. These are patterns, no source copied.
- The `dataviz` skill (palette validation method) contributed the habit of validating colour computationally. Its categorical/CVD validator is for chart series and does not apply to UI chrome, so we use a WCAG ratio script instead.

## 2. The five themes

| id (`data-theme`) | Name | Scheme | Personality |
|---|---|---|---|
| `default` | Teal Classic | light | The current look: fresh teal with a lime spark. Unchanged. |
| `dark` | Midnight | dark | Deep navy-slate dark. Lighter surfaces = higher elevation, mint-teal accent, no pure black. |
| `ember` | Ember | light | Warm and grounded: deep amber-brown on soft sand, golden spark. Colour-blind friendly. |
| `tide` | Tide | light | Cool and calm: clear blue with a cyan edge. Clean and focused. |
| `graphite` | Graphite | light | High-contrast neutral: ink on paper, near-monochrome, AAA text, strong borders. |

Plus a picker option **Auto** (a mode, and the default for everyone): follows `prefers-color-scheme`, resolving to `default` or `dark`, live-updating when the OS flips.

Ember was reworked after review: terracotta sat too close to crimson danger and amber warn for colour-blind users, so primary is now a dark amber-brown (`#8a4a12`), status notes are light tinted blocks with a border (plus an icon/label cue, see 5.6 step 6), and warn is an olive-yellow tint clearly lighter than the primary fills. Primary, warn and danger text are all similar in lightness, so they are told apart by structure (filled button vs tinted note) and icons, never by hue alone; this holds in every theme.

Why this set: one warm, one cool, one neutral/high-contrast, one dark. The three light variants differ in hue temperature and the dark variant covers low-light use. Graphite doubles as the accessibility theme (outdoor/gym glare). A second dark (e.g. true OLED "Black") is deliberately omitted: it would need pure black, which this plan avoids; it can be added later as one block.

### 2.1 Full token table

Existing tokens keep their names. New tokens are marked in section 2.2. The `rgba()` and shadow values are complete strings so a component never composes colours itself. (`--radius*` and `--tabbar-h` are not theme-dependent and stay in the shared `:root`.)

| Token | Teal Classic | Midnight | Ember | Tide | Graphite |
|---|---|---|---|---|---|
| `--bg` | `#f4f6fb` | `#0e1523` | `#faf4ec` | `#eef3fa` | `#ececee` |
| `--surface` | `#ffffff` | `#151e30` | `#fffdf9` | `#ffffff` | `#ffffff` |
| `--surface-2` | `#f8fafc` | `#1c273b` | `#fbf5ec` | `#f5f8fd` | `#f4f4f5` |
| `--border` | `#e3e8f0` | `#2a364d` | `#ecdfcc` | `#dce5f1` | `#c9c9ce` |
| `--border-strong` | `#cbd5e1` | `#3d4c66` | `#d9c6aa` | `#bccbe0` | `#71717a` |
| `--input-border` | `#7e8ea4` | `#7a8aa6` | `#8d765a` | `#74869f` | `#52525b` |
| `--border-hover` | `#94a3b8` | `#9aa9c2` | `#a38b6c` | `#8697b1` | `#3f3f46` |
| `--text` | `#0f172a` | `#e8edf6` | `#2a1c11` | `#0b1a33` | `#09090b` |
| `--text-2` | `#475569` | `#b7c2d6` | `#5a4536` | `#40526c` | `#2e2e34` |
| `--muted` | `#5b6a80` | `#98a5bc` | `#755f4c` | `#586982` | `#46464e` |
| `--placeholder` | `#64748b` | `#8795ae` | `#85705c` | `#64748f` | `#5f5f68` |
| `--primary` | `#0f766e` | `#2dd4bf` | `#8a4a12` | `#1d4ed8` | `#18181b` |
| `--primary-hover` | `#115e59` | `#5eead4` | `#6b370c` | `#1e40af` | `#000000` |
| `--primary-soft` | `#e6f6f4` | `#123a3d` | `#f7ebdc` | `#e4ecfd` | `#e4e4e7` |
| `--primary-border` | `#b6e3dd` | `#1f5d5c` | `#e2c7a0` | `#bfd1f8` | `#a1a1aa` |
| `--on-primary` | `#ffffff` | `#04211e` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--accent` | `#84cc16` | `#a3e635` | `#f5b83d` | `#06b6d4` | `#a3e635` |
| `--danger` | `#dc2626` | `#f87171` | `#be123c` | `#c81e1e` | `#b91c1c` |
| `--danger-soft` | `#fef2f2` | `#3a1c22` | `#fff1f5` | `#fef2f2` | `#fef2f2` |
| `--danger-border` | `#fecaca` | `#7f2f38` | `#f5b5c8` | `#fecaca` | `#e08a8a` |
| `--danger-text` | `#b91c1c` | `#fca5a5` | `#9f1239` | `#a61b1b` | `#991b1b` |
| `--on-danger` | `#ffffff` | `#2a0a0c` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--ok` | `#15803d` | `#4ade80` | `#3f7a1a` | `#15803d` | `#166534` |
| `--warn` | `#b45309` | `#fbbf24` | `#6b5600` | `#b45309` | `#92400e` |
| `--warn-soft` | `#fffbeb` | `#2d2410` | `#fffbd1` | `#fffbeb` | `#fef3c7` |
| `--warn-border` | `#fcd34d` | `#6b5316` | `#e3cf2c` | `#fcd34d` | `#b7791f` |
| `--warn-text` | `#78350f` | `#fde68a` | `#4a3b00` | `#78350f` | `#451a03` |
| `--warn-hover` | `#fef3c7` | `#3a2e12` | `#fff3a0` | `#fef3c7` | `#fde68a` |
| `--chip-official-bg` | `#eef2ff` | `#25285a` | `#f3ebff` | `#f1ebff` | `#e0e7ff` |
| `--chip-official-fg` | `#3730a3` | `#c7d2fe` | `#6b21a8` | `#5b21b6` | `#1e1b4b` |
| `--chip-official-border` | `#c7d2fe` | `#454a99` | `#d9c2fa` | `#d6c8fa` | `#6366f1` |
| `--toast-bg` | `#0f172a` | `#e8edf6` | `#2a1c11` | `#0b1a33` | `#09090b` |
| `--toast-fg` | `#ffffff` | `#0e1523` | `#fffdf9` | `#ffffff` | `#ffffff` |
| `--tabbar-bg` | `rgba(255,255,255,.92)` | `rgba(21,30,48,.92)` | `rgba(255,253,249,.92)` | `rgba(255,255,255,.92)` | `rgba(255,255,255,.96)` |
| `--scrim` | `rgba(15,23,42,.5)` | `rgba(3,7,16,.65)` | `rgba(42,28,17,.5)` | `rgba(11,26,51,.5)` | `rgba(9,9,11,.6)` |
| `--scrim-strong` | `rgba(15,23,42,.7)` | `rgba(3,7,16,.82)` | `rgba(42,28,17,.72)` | `rgba(11,26,51,.72)` | `rgba(9,9,11,.8)` |
| `--focus` | `#0f766e` | `#5eead4` | `#8a4a12` | `#1d4ed8` | `#1d4ed8` |
| `--ring` | `0 0 0 3px rgba(15,118,110,.25)` | `0 0 0 3px rgba(94,234,212,.35)` | `0 0 0 3px rgba(138,74,18,.28)` | `0 0 0 3px rgba(29,78,216,.25)` | `0 0 0 3px rgba(29,78,216,.45)` |
| `--brand-1` | `#0f766e` | `#14b8a6` | `#6b370c` | `#1d4ed8` | `#18181b` |
| `--brand-2` | `#14b8a6` | `#2dd4bf` | `#a8651a` | `#3b82f6` | `#3f3f46` |
| `--brand-3` | `#84cc16` | `#a3e635` | `#f5b83d` | `#22d3ee` | `#a3e635` |
| `--brand-fg` | `#ffffff` | `#04211e` | `#ffffff` | `#ffffff` | `#ffffff` |
| `--brand-shadow` | `0 6px 16px -4px rgba(15,118,110,.5)` | `0 6px 16px -4px rgba(45,212,191,.35)` | `0 6px 16px -4px rgba(107,55,12,.45)` | `0 6px 16px -4px rgba(29,78,216,.45)` | `0 6px 16px -4px rgba(9,9,11,.4)` |
| `--glow-1` | `rgba(132,204,22,.14)` | `rgba(163,230,53,.05)` | `rgba(245,184,61,.18)` | `rgba(34,211,238,.14)` | `rgba(163,230,53,.10)` |
| `--glow-2` | `rgba(15,118,110,.12)` | `rgba(45,212,191,.09)` | `rgba(138,74,18,.09)` | `rgba(29,78,216,.10)` | `rgba(9,9,11,.05)` |
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,.06)` | `0 1px 2px rgba(0,0,0,.40)` | `0 1px 2px rgba(42,28,17,.07)` | `0 1px 2px rgba(11,26,51,.06)` | `0 1px 2px rgba(9,9,11,.10)` |
| `--shadow` | `0 1px 3px rgba(15,23,42,.06), 0 8px 24px -8px rgba(15,23,42,.10)` | `0 1px 3px rgba(0,0,0,.40), 0 8px 24px -8px rgba(0,0,0,.55)` | `0 1px 3px rgba(42,28,17,.07), 0 8px 24px -8px rgba(42,28,17,.12)` | `0 1px 3px rgba(11,26,51,.06), 0 8px 24px -8px rgba(11,26,51,.11)` | `0 1px 3px rgba(9,9,11,.10), 0 8px 24px -8px rgba(9,9,11,.14)` |
| `--shadow-lg` | `0 24px 48px -12px rgba(15,23,42,.25)` | `0 24px 48px -12px rgba(0,0,0,.70)` | `0 24px 48px -12px rgba(42,28,17,.28)` | `0 24px 48px -12px rgba(11,26,51,.26)` | `0 24px 48px -12px rgba(9,9,11,.35)` |
| `--shadow-hover` | `0 6px 16px rgba(15,23,42,.12)` | `0 6px 16px rgba(0,0,0,.50)` | `0 6px 16px rgba(42,28,17,.14)` | `0 6px 16px rgba(11,26,51,.12)` | `0 6px 16px rgba(9,9,11,.18)` |
| `--shadow-menu` | `0 10px 30px rgba(15,23,42,.18)` | `0 10px 30px rgba(0,0,0,.60)` | `0 10px 30px rgba(42,28,17,.20)` | `0 10px 30px rgba(11,26,51,.18)` | `0 10px 30px rgba(9,9,11,.25)` |
| `--shadow-tabbar` | `0 -4px 16px rgba(15,23,42,.06)` | `0 -4px 16px rgba(0,0,0,.35)` | `0 -4px 16px rgba(42,28,17,.07)` | `0 -4px 16px rgba(11,26,51,.06)` | `0 -4px 16px rgba(9,9,11,.10)` |
| `--img-filter` | `none` | `brightness(.9)` | `none` | `none` | `none` |

### 2.2 New semantic tokens (and what they replace)

| New token | Replaces literal | Notes |
|---|---|---|
| `--on-primary` | `#fff` on primary fills (`button`, `.chip.active`, `.chip[aria-pressed]`, `.pl-seg`, `.cs-badge`, `.pl-step-num`) | Dark ink in Midnight. |
| `--on-danger` | `#fff` in `#toast.err` | Dark ink in Midnight. |
| `--primary-border` | `#b6e3dd` (`.pl-note`, `.pl-item-chip`, `.pl-row.on`) | |
| `--danger-border` | `#fecaca` (`.danger-btn`, `.server-error`) | |
| `--danger-text` | `#b91c1c` (`.row-menu-item.danger`) | Recommended for *all* small danger text (see 4.3). |
| `--warn-text` | `#78350f` (`.pl-note.warn`) | |
| `--warn-hover` | `#fef3c7` (`.pl-day.empty .pl-day-open:hover`) | |
| `--chip-official-bg/fg/border` | `#eef2ff` `#3730a3` `#c7d2fe` | Indigo/violet family per theme, so it never collides with primary. |
| `--input-border` | `--border-strong` on inputs, secondary buttons, chips, `.pl-seg` | Default = `#7e8ea4` (accepted refinement; was `#cbd5e1`). Separate token because the decorative `border-strong` and the 3:1 "UI component boundary" are different jobs. |
| `--border-hover` | `#94a3b8` (input/secondary hover) | |
| `--placeholder` | `#94a3b8` | |
| `--focus` | solid focus colour; recommended `outline: 2px solid var(--focus); outline-offset: 2px` | `--ring` (soft halo) stays as the supplementary glow. |
| `--brand-1/2/3`, `--brand-fg`, `--brand-shadow` | `.brand-mark` gradient `#0f766e / #14b8a6 / lime`, `#fff`, `rgba(15,118,110,.5)` | |
| `--glow-1`, `--glow-2` | the two body radial gradients | |
| `--tabbar-bg` | `rgba(255,255,255,.92)` | |
| `--scrim`, `--scrim-strong` | modal backdrop `.5`, lightbox `.7` | |
| `--toast-bg`, `--toast-fg` | `var(--text)` / `#fff` | In dark the toast inverts to a light snackbar (Material "inverse surface"). |
| `--shadow-hover`, `--shadow-menu`, `--shadow-tabbar` | `0 6px 16px rgba(15,23,42,.12)` (x2 cards), `0 10px 30px ...` (row menu), `0 -4px 16px ...` (tab bar) | `--shadow-sm/--shadow/--shadow-lg` already exist. |
| `--img-filter` | (new) | `none` on light themes, `brightness(.9)` in Midnight, applied to content images. |

Constants that deliberately do NOT become tokens (identical in every theme): the dark image-caption gradients `rgba(15,23,42,.85 / .6)` on `.mv-name` and the cover-badge scrim `rgba(15,23,42,.65)` with white text. They sit on arbitrary photos and must stay dark so white text keeps contrast; we name them `--media-fade-strong`, `--media-fade-soft`, `--media-badge-bg` and `--on-media: #fff` in the shared `:root` purely to remove literals from components (worst case on a pure-white photo: white text on the fade = 11.9:1 / 5.4:1, see table).

### 2.3 CSS blocks (ready to paste into `static/themes.css`)

```css
:root,
:root[data-theme="default"] {
  color-scheme: light;
  --bg: #f4f6fb;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --border: #e3e8f0;
  --border-strong: #cbd5e1;
  --input-border: #7e8ea4;
  --border-hover: #94a3b8;
  --text: #0f172a;
  --text-2: #475569;
  --muted: #5b6a80;
  --placeholder: #64748b;
  --primary: #0f766e;
  --primary-hover: #115e59;
  --primary-soft: #e6f6f4;
  --primary-border: #b6e3dd;
  --on-primary: #ffffff;
  --accent: #84cc16;
  --danger: #dc2626;
  --danger-soft: #fef2f2;
  --danger-border: #fecaca;
  --danger-text: #b91c1c;
  --on-danger: #ffffff;
  --ok: #15803d;
  --warn: #b45309;
  --warn-soft: #fffbeb;
  --warn-border: #fcd34d;
  --warn-text: #78350f;
  --warn-hover: #fef3c7;
  --chip-official-bg: #eef2ff;
  --chip-official-fg: #3730a3;
  --chip-official-border: #c7d2fe;
  --toast-bg: #0f172a;
  --toast-fg: #ffffff;
  --tabbar-bg: rgba(255,255,255,.92);
  --scrim: rgba(15,23,42,.5);
  --scrim-strong: rgba(15,23,42,.7);
  --focus: #0f766e;
  --ring: 0 0 0 3px rgba(15,118,110,.25);
  --brand-1: #0f766e;
  --brand-2: #14b8a6;
  --brand-3: #84cc16;
  --brand-fg: #ffffff;
  --brand-shadow: 0 6px 16px -4px rgba(15,118,110,.5);
  --glow-1: rgba(132,204,22,.14);
  --glow-2: rgba(15,118,110,.12);
  --shadow-sm: 0 1px 2px rgba(15,23,42,.06);
  --shadow: 0 1px 3px rgba(15,23,42,.06), 0 8px 24px -8px rgba(15,23,42,.10);
  --shadow-lg: 0 24px 48px -12px rgba(15,23,42,.25);
  --shadow-hover: 0 6px 16px rgba(15,23,42,.12);
  --shadow-menu: 0 10px 30px rgba(15,23,42,.18);
  --shadow-tabbar: 0 -4px 16px rgba(15,23,42,.06);
  --img-filter: none;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0e1523;
  --surface: #151e30;
  --surface-2: #1c273b;
  --border: #2a364d;
  --border-strong: #3d4c66;
  --input-border: #7a8aa6;
  --border-hover: #9aa9c2;
  --text: #e8edf6;
  --text-2: #b7c2d6;
  --muted: #98a5bc;
  --placeholder: #8795ae;
  --primary: #2dd4bf;
  --primary-hover: #5eead4;
  --primary-soft: #123a3d;
  --primary-border: #1f5d5c;
  --on-primary: #04211e;
  --accent: #a3e635;
  --danger: #f87171;
  --danger-soft: #3a1c22;
  --danger-border: #7f2f38;
  --danger-text: #fca5a5;
  --on-danger: #2a0a0c;
  --ok: #4ade80;
  --warn: #fbbf24;
  --warn-soft: #2d2410;
  --warn-border: #6b5316;
  --warn-text: #fde68a;
  --warn-hover: #3a2e12;
  --chip-official-bg: #25285a;
  --chip-official-fg: #c7d2fe;
  --chip-official-border: #454a99;
  --toast-bg: #e8edf6;
  --toast-fg: #0e1523;
  --tabbar-bg: rgba(21,30,48,.92);
  --scrim: rgba(3,7,16,.65);
  --scrim-strong: rgba(3,7,16,.82);
  --focus: #5eead4;
  --ring: 0 0 0 3px rgba(94,234,212,.35);
  --brand-1: #14b8a6;
  --brand-2: #2dd4bf;
  --brand-3: #a3e635;
  --brand-fg: #04211e;
  --brand-shadow: 0 6px 16px -4px rgba(45,212,191,.35);
  --glow-1: rgba(163,230,53,.05);
  --glow-2: rgba(45,212,191,.09);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.40);
  --shadow: 0 1px 3px rgba(0,0,0,.40), 0 8px 24px -8px rgba(0,0,0,.55);
  --shadow-lg: 0 24px 48px -12px rgba(0,0,0,.70);
  --shadow-hover: 0 6px 16px rgba(0,0,0,.50);
  --shadow-menu: 0 10px 30px rgba(0,0,0,.60);
  --shadow-tabbar: 0 -4px 16px rgba(0,0,0,.35);
  --img-filter: brightness(.9);
}

:root[data-theme="ember"] {
  color-scheme: light;
  --bg: #faf4ec;
  --surface: #fffdf9;
  --surface-2: #fbf5ec;
  --border: #ecdfcc;
  --border-strong: #d9c6aa;
  --input-border: #8d765a;
  --border-hover: #a38b6c;
  --text: #2a1c11;
  --text-2: #5a4536;
  --muted: #755f4c;
  --placeholder: #85705c;
  --primary: #8a4a12;
  --primary-hover: #6b370c;
  --primary-soft: #f7ebdc;
  --primary-border: #e2c7a0;
  --on-primary: #ffffff;
  --accent: #f5b83d;
  --danger: #be123c;
  --danger-soft: #fff1f5;
  --danger-border: #f5b5c8;
  --danger-text: #9f1239;
  --on-danger: #ffffff;
  --ok: #3f7a1a;
  --warn: #6b5600;
  --warn-soft: #fffbd1;
  --warn-border: #e3cf2c;
  --warn-text: #4a3b00;
  --warn-hover: #fff3a0;
  --chip-official-bg: #f3ebff;
  --chip-official-fg: #6b21a8;
  --chip-official-border: #d9c2fa;
  --toast-bg: #2a1c11;
  --toast-fg: #fffdf9;
  --tabbar-bg: rgba(255,253,249,.92);
  --scrim: rgba(42,28,17,.5);
  --scrim-strong: rgba(42,28,17,.72);
  --focus: #8a4a12;
  --ring: 0 0 0 3px rgba(138,74,18,.28);
  --brand-1: #6b370c;
  --brand-2: #a8651a;
  --brand-3: #f5b83d;
  --brand-fg: #ffffff;
  --brand-shadow: 0 6px 16px -4px rgba(107,55,12,.45);
  --glow-1: rgba(245,184,61,.18);
  --glow-2: rgba(138,74,18,.09);
  --shadow-sm: 0 1px 2px rgba(42,28,17,.07);
  --shadow: 0 1px 3px rgba(42,28,17,.07), 0 8px 24px -8px rgba(42,28,17,.12);
  --shadow-lg: 0 24px 48px -12px rgba(42,28,17,.28);
  --shadow-hover: 0 6px 16px rgba(42,28,17,.14);
  --shadow-menu: 0 10px 30px rgba(42,28,17,.20);
  --shadow-tabbar: 0 -4px 16px rgba(42,28,17,.07);
  --img-filter: none;
}

:root[data-theme="tide"] {
  color-scheme: light;
  --bg: #eef3fa;
  --surface: #ffffff;
  --surface-2: #f5f8fd;
  --border: #dce5f1;
  --border-strong: #bccbe0;
  --input-border: #74869f;
  --border-hover: #8697b1;
  --text: #0b1a33;
  --text-2: #40526c;
  --muted: #586982;
  --placeholder: #64748f;
  --primary: #1d4ed8;
  --primary-hover: #1e40af;
  --primary-soft: #e4ecfd;
  --primary-border: #bfd1f8;
  --on-primary: #ffffff;
  --accent: #06b6d4;
  --danger: #c81e1e;
  --danger-soft: #fef2f2;
  --danger-border: #fecaca;
  --danger-text: #a61b1b;
  --on-danger: #ffffff;
  --ok: #15803d;
  --warn: #b45309;
  --warn-soft: #fffbeb;
  --warn-border: #fcd34d;
  --warn-text: #78350f;
  --warn-hover: #fef3c7;
  --chip-official-bg: #f1ebff;
  --chip-official-fg: #5b21b6;
  --chip-official-border: #d6c8fa;
  --toast-bg: #0b1a33;
  --toast-fg: #ffffff;
  --tabbar-bg: rgba(255,255,255,.92);
  --scrim: rgba(11,26,51,.5);
  --scrim-strong: rgba(11,26,51,.72);
  --focus: #1d4ed8;
  --ring: 0 0 0 3px rgba(29,78,216,.25);
  --brand-1: #1d4ed8;
  --brand-2: #3b82f6;
  --brand-3: #22d3ee;
  --brand-fg: #ffffff;
  --brand-shadow: 0 6px 16px -4px rgba(29,78,216,.45);
  --glow-1: rgba(34,211,238,.14);
  --glow-2: rgba(29,78,216,.10);
  --shadow-sm: 0 1px 2px rgba(11,26,51,.06);
  --shadow: 0 1px 3px rgba(11,26,51,.06), 0 8px 24px -8px rgba(11,26,51,.11);
  --shadow-lg: 0 24px 48px -12px rgba(11,26,51,.26);
  --shadow-hover: 0 6px 16px rgba(11,26,51,.12);
  --shadow-menu: 0 10px 30px rgba(11,26,51,.18);
  --shadow-tabbar: 0 -4px 16px rgba(11,26,51,.06);
  --img-filter: none;
}

:root[data-theme="graphite"] {
  color-scheme: light;
  --bg: #ececee;
  --surface: #ffffff;
  --surface-2: #f4f4f5;
  --border: #c9c9ce;
  --border-strong: #71717a;
  --input-border: #52525b;
  --border-hover: #3f3f46;
  --text: #09090b;
  --text-2: #2e2e34;
  --muted: #46464e;
  --placeholder: #5f5f68;
  --primary: #18181b;
  --primary-hover: #000000;
  --primary-soft: #e4e4e7;
  --primary-border: #a1a1aa;
  --on-primary: #ffffff;
  --accent: #a3e635;
  --danger: #b91c1c;
  --danger-soft: #fef2f2;
  --danger-border: #e08a8a;
  --danger-text: #991b1b;
  --on-danger: #ffffff;
  --ok: #166534;
  --warn: #92400e;
  --warn-soft: #fef3c7;
  --warn-border: #b7791f;
  --warn-text: #451a03;
  --warn-hover: #fde68a;
  --chip-official-bg: #e0e7ff;
  --chip-official-fg: #1e1b4b;
  --chip-official-border: #6366f1;
  --toast-bg: #09090b;
  --toast-fg: #ffffff;
  --tabbar-bg: rgba(255,255,255,.96);
  --scrim: rgba(9,9,11,.6);
  --scrim-strong: rgba(9,9,11,.8);
  --focus: #1d4ed8;
  --ring: 0 0 0 3px rgba(29,78,216,.45);
  --brand-1: #18181b;
  --brand-2: #3f3f46;
  --brand-3: #a3e635;
  --brand-fg: #ffffff;
  --brand-shadow: 0 6px 16px -4px rgba(9,9,11,.4);
  --glow-1: rgba(163,230,53,.10);
  --glow-2: rgba(9,9,11,.05);
  --shadow-sm: 0 1px 2px rgba(9,9,11,.10);
  --shadow: 0 1px 3px rgba(9,9,11,.10), 0 8px 24px -8px rgba(9,9,11,.14);
  --shadow-lg: 0 24px 48px -12px rgba(9,9,11,.35);
  --shadow-hover: 0 6px 16px rgba(9,9,11,.18);
  --shadow-menu: 0 10px 30px rgba(9,9,11,.25);
  --shadow-tabbar: 0 -4px 16px rgba(9,9,11,.10);
  --img-filter: none;
}
```

(The `:root` block of `default` must also keep the non-theme tokens `--radius-sm`, `--radius`, `--radius-lg`, `--tabbar-h` and the `--media-*` constants; put those in a shared `:root` above the theme blocks.)

## 3. Contrast verification

### 3.1 How the contrast was verified

A Python script (WCAG 2.x relative-luminance formula, alpha-composited for `rgba` surfaces such as the tab bar) evaluates every pair below for each theme. It lives outside the repo; the intended follow-up is to commit a ~60-line `scripts/check-theme-contrast.js` that parses `themes.css` and fails CI/`npm test`-style when a pair drops under its minimum. That keeps future palettes honest. Thresholds: 4.5:1 for text, 3:1 for non-text UI boundaries and focus indicators (WCAG 1.4.3 / 1.4.11 / 2.4.11). "Min -" rows are informational (logo is exempt).

### 3.2 Results

| Pair | Min | Teal Classic | Midnight | Ember | Tide | Graphite |
|---|---|---|---|---|---|---|
| Body text on page bg | 4.5 | 16.51 pass | 15.54 pass | 15.10 pass | 15.57 pass | 16.86 pass |
| Body text on surface (cards, modals) | 4.5 | 17.85 pass | 14.18 pass | 16.24 pass | 17.36 pass | 19.90 pass |
| Body text on surface-2 (hover rows, hints) | 4.5 | 17.06 pass | 12.74 pass | 15.22 pass | 16.31 pass | 18.10 pass |
| text-2 on surface | 4.5 | 7.58 pass | 9.28 pass | 8.84 pass | 7.95 pass | 13.49 pass |
| text-2 on bg | 4.5 | 7.01 pass | 10.17 pass | 8.21 pass | 7.13 pass | 11.44 pass |
| text-2 on surface-2 | 4.5 | 7.24 pass | 8.34 pass | 8.28 pass | 7.47 pass | 12.27 pass |
| muted on surface | 4.5 | 5.50 pass | 6.70 pass | 5.91 pass | 5.59 pass | 9.35 pass |
| muted on surface-2 (.cs-panel, empty state) | 4.5 | 5.26 pass | 6.02 pass | 5.54 pass | 5.25 pass | 8.50 pass |
| muted on bg (header subtitle) | 4.5 | 5.09 pass | 7.34 pass | 5.49 pass | 5.01 pass | 7.92 pass |
| Placeholder on surface (input) | 4.5 | 4.76 pass | 5.51 pass | 4.62 pass | 4.73 pass | 6.32 pass |
| on-primary on primary (buttons, active chip, badge) | 4.5 | 5.47 pass | 9.09 pass | 6.84 pass | 6.70 pass | 17.72 pass |
| on-primary on primary-hover | 4.5 | 7.58 pass | 11.43 pass | 9.65 pass | 8.72 pass | 21.00 pass |
| primary as text/link on surface | 4.5 | 5.47 pass | 8.95 pass | 6.74 pass | 6.70 pass | 17.72 pass |
| primary as text on bg | 4.5 | 5.06 pass | 9.81 pass | 6.26 pass | 6.01 pass | 15.02 pass |
| primary on primary-soft (active tab, pills) | 4.5 | 4.91 pass | 6.64 pass | 5.82 pass | 5.65 pass | 13.96 pass |
| text-2 on primary-soft (.pl-note) | 4.5 | 6.80 pass | 6.89 pass | 7.64 pass | 6.71 pass | 10.63 pass |
| text on primary-soft (picker hover) | 4.5 | 16.03 pass | 10.53 pass | 14.04 pass | 14.64 pass | 15.68 pass |
| danger text on surface | 4.5 | 4.83 pass | 6.02 pass | 6.19 pass | 5.74 pass | 6.47 pass |
| danger text on danger-soft (.server-error; uses danger-text) | 4.5 | 5.91 pass | 8.08 pass | 7.31 pass | 6.87 pass | 7.60 pass |
| danger-text (menu item) on surface | 4.5 | 6.47 pass | 8.78 pass | 7.89 pass | 7.52 pass | 8.31 pass |
| on-danger on danger (toast.err) | 4.5 | 4.83 pass | 6.62 pass | 6.29 pass | 5.74 pass | 6.47 pass |
| ok on surface | 4.5 | 5.02 pass | 9.56 pass | 5.15 pass | 5.02 pass | 7.13 pass |
| warn on warn-soft (.pl-none) | 4.5 | 4.84 pass | 9.17 pass | 6.76 pass | 4.84 pass | 6.37 pass |
| warn-text on warn-soft (.pl-note.warn) | 4.5 | 8.75 pass | 12.30 pass | 10.42 pass | 8.75 pass | 13.45 pass |
| text on warn-hover | 4.5 | 16.03 pass | 11.32 pass | 14.60 pass | 15.59 pass | 15.98 pass |
| official chip fg on bg | 4.5 | 8.88 pass | 9.20 pass | 7.53 pass | 7.73 pass | 12.98 pass |
| primary chip fg on primary-soft (pl-item-chip) | 4.5 | 4.91 pass | 6.64 pass | 5.82 pass | 5.65 pass | 13.96 pass |
| toast fg on toast bg | 4.5 | 17.85 pass | 15.54 pass | 16.24 pass | 17.36 pass | 19.90 pass |
| text-2 on tab bar (composited on bg) | 4.5 | 7.53 pass | 9.36 pass | 8.79 pass | 7.88 pass | 13.41 pass |
| primary on tab-bar active pill (primary-soft) | 4.5 | 4.91 pass | 6.64 pass | 5.82 pass | 5.65 pass | 13.96 pass |
| brand-mark icon on gradient start (logo, informational) | - | 5.47 (info) | 6.80 (info) | 9.65 (info) | 6.70 (info) | 17.72 (info) |
| brand-mark icon on gradient mid (logo, informational) | - | 2.49 (info) | 9.09 (info) | 4.62 (info) | 3.68 (info) | 10.44 (info) |
| brand-mark icon on gradient end (logo, informational) | - | 1.98 (info) | 11.22 (info) | 1.78 (info) | 1.81 (info) | 1.51 (info) |
| Focus ring vs surface (non-text 3:1) | 3.0 | 5.47 pass | 11.26 pass | 6.74 pass | 6.70 pass | 6.70 pass |
| Focus ring vs bg | 3.0 | 5.06 pass | 12.34 pass | 6.26 pass | 6.01 pass | 5.68 pass |
| Focus ring vs surface-2 | 3.0 | 5.23 pass | 10.12 pass | 6.31 pass | 6.30 pass | 6.10 pass |
| Input border vs surface (non-text 3:1) | 3.0 | 3.34 pass | 4.77 pass | 4.24 pass | 3.71 pass | 7.73 pass |
| Input border vs bg | 3.0 | 3.09 pass | 5.23 pass | 3.94 pass | 3.33 pass | 6.55 pass |
| Primary fill vs surface (button/selected edge 3:1) | 3.0 | 5.47 pass | 8.95 pass | 6.74 pass | 6.70 pass | 17.72 pass |
| on-media white on name fade, worst case white photo (alpha .85 at bottom) | 4.5 | 11.41 pass | 11.41 pass | 11.41 pass | 11.41 pass | 11.41 pass |
| cover badge (.65 scrim) over white photo | 4.5 | 5.57 pass | 5.57 pass | 5.57 pass | 5.57 pass | 5.57 pass |

### 3.3 Findings

- **Midnight, Ember, Tide, Graphite pass every required pair.** Several were tuned to get there: Ember `primary-soft` lightened so terracotta text on tinted pills reaches 4.5; Tide `placeholder` darkened; every non-default theme gets an `--input-border` that reaches 3:1 against both surface and bg.
- **Teal Classic as it is today has 5 pre-existing failures** (fixed by the accepted refinements below; the table above already shows the refined values and every pair now passes). They are properties of today's CSS, not of the feature:
  1. Placeholder `#94a3b8` on white: 2.56:1 (needs 4.5).
  2. Input / secondary-button / chip border `#cbd5e1` on white: 1.48:1 (needs 3:1 for the control boundary).
  3. `muted` `#64748b` on bg `#f4f6fb`: 4.40:1 (header subtitle "Unofficial client"; fine on white at 4.76).
  4. `danger` `#dc2626` text on `danger-soft` `#fef2f2` (`.server-error`): 4.41:1.
  5. (Logo gradient icon contrast is exempt as a logotype.)
- **Refinements to the default (ACCEPTED by the owner).** Only token values change, no component code:

  | Token | Today | Proposed | Result |
  |---|---|---|---|
  | `--placeholder` | `#94a3b8` | `#64748b` | 4.76:1 on white |
  | `--input-border` | `#cbd5e1` | `#7e8ea4` | 3.34:1 on white |
  | `--muted` | `#64748b` | `#5b6a80` | 5.50 on white, 5.09 on bg |
  | text inside `.server-error`/`.error` | `--danger` | `--danger-text` (`#b91c1c`) | 5.91:1 on danger-soft |

  Visible effect: field outlines are noticeably stronger in the default theme.
- Graphite's focus colour is blue (`#1d4ed8`) rather than the brand ink, on purpose: a black ring around a black button disappears.
- Brand logo gradient end stops (lime) are low contrast with the white/dark glyph in every theme including today's; logos are exempt from 1.4.11 and the glyph is decorative (`aria-hidden`).
- Not measured numerically: text on arbitrary exercise photos (only the caption fade, worst case computed) and the semi-transparent hover states.

## 4. Hard-coded colour inventory and token mapping

Line numbers refer to `static/style.css` as read for this plan.

### 4.1 `:root` and global

| Line(s) | Literal | Token |
|---|---|---|
| 10-36 | all current `:root` values | move into `[data-theme="default"]` block unchanged; keep radii and `--tabbar-h` in shared `:root` |
| 6 | `color-scheme: light` | per-theme `color-scheme` |
| 55-56 | body radial gradients `rgba(132,204,22,.14)`, `rgba(15,118,110,.12)` | `--glow-1`, `--glow-2` |
| 83-85 | `.brand-mark` `color:#fff`, gradient `#14b8a6`, shadow `rgba(15,118,110,.5)` | `--brand-fg`, `--brand-1/2/3`, `--brand-shadow` |
| 135 | `input:hover` `#94a3b8` | `--border-hover` |
| 129 | input border `--border-strong` | `--input-border` |
| 139 | placeholder `#94a3b8` | `--placeholder` |
| 147 | `button` `color:#fff` | `--on-primary` |
| 168 | `button.secondary:hover` border `#94a3b8`; base border | `--border-hover`; `--input-border` |
| 170 | `.danger-btn` border `#fecaca` | `--danger-border` |
| 247 | `.server-error` border `#fecaca` | `--danger-border` (and text -> `--danger-text` if refinement accepted) |
| 274 | `.cover-badge` `rgba(15,23,42,.65)`, `#fff` | `--media-badge-bg`, `--on-media` |
| 311 | `.row-menu` shadow | `--shadow-menu` |
| 319 | `.row-menu-item.danger` `#b91c1c` | `--danger-text` |
| 340 | modal backdrop `rgba(15,23,42,.5)` | `--scrim` |
| 345 | `#lightbox-backdrop` `rgba(15,23,42,.7)` | `--scrim-strong` |
| 364 | `.chip.active` `#fff` | `--on-primary` |
| 382 | `#toast` `background: var(--text); color:#fff` | `--toast-bg`, `--toast-fg` |
| 387 | `#toast.err` `color:#fff !important` | `--on-danger` (drop `!important` if specificity allows, otherwise keep) |
| 420 | tab bar `rgba(255,255,255,.92)` | `--tabbar-bg` |
| 422 | tab bar shadow `rgba(15,23,42,.06)` | `--shadow-tabbar` |
| 521-523 | `:root{ --warn, --warn-soft, --warn-border }` (second `:root` in Plans section) | merge into theme blocks, delete this second `:root` |
| 552 | `.pl-step-btn.active .pl-step-num` `#fff` | `--on-primary` |
| 557 | `.pl-note` border `#b6e3dd` | `--primary-border` |
| 560 | `.pl-note.warn` `#78350f` | `--warn-text` |
| 571 | `.chip[aria-pressed=true]` `#fff` | `--on-primary` |
| 614 | `.pl-seg button[aria-pressed=true]` `#fff` | `--on-primary` |
| 615 | `.pl-seg button:focus-visible` `inset rgba(15,118,110,.45)` | `inset 0 0 0 3px var(--focus)` |
| 627 | `.pl-item-chip` border `#b6e3dd` | `--primary-border` |
| 629 | `.pl-item-chip.official` `#eef2ff #3730a3 #c7d2fe` | `--chip-official-bg/fg/border` |
| 649 | `.pl-day.empty .pl-day-open:hover` `#fef3c7` | `--warn-hover` |
| 669 | planner modal backdrop `rgba(15,23,42,.5)` | `--scrim` |
| 693 | `.pl-row.on` border `#b6e3dd` | `--primary-border` |
| 760 | `.mv-card` `color:#fff` | `--on-media` |
| 763, 825 | card hover shadow `rgba(15,23,42,.12)` | `--shadow-hover` |
| 770, 772 | `.mv-name` gradients `rgba(15,23,42,.85/.6)` | `--media-fade-strong/-soft` (constant) |
| 811 | `.cs-badge` `#fff` | `--on-primary` |
| 66-ish, 2 other `rgba(15,118,110,...)` | `--ring` / focus halos | `--ring`, `--focus` |

Not literals but worth a check: `.mv-ph` / `.cs-img .mv-ph` / `.cs-step-ph` / `.mv-empty-icon` use `var(--border-strong)` as an icon colour. In dark `--border-strong` (`#3d4c66`) on `surface-2` is low contrast for a placeholder glyph, which is acceptable (decorative) but looks muted; leave, or point them at `--muted` at 60% if it reads too faint in QA.

### 4.2 HTML and JS

| Location | Literal | Action |
|---|---|---|
| `static/index.html:6` | `<meta name="theme-color" content="#0f766e">` | DECIDED: match the page background. Static value becomes `#f4f6fb`; the head script rewrites it per theme: default `#f4f6fb`, dark `#0e1523`, ember `#faf4ec`, tide `#eef3fa`, graphite `#ececee` (= each theme's `--bg`, also stored as `--meta-theme-color`). |
| `index.html` lines 15, 41-46, 65, 175 and `courses.js:7`, `movements.js:8` | inline SVG `stroke="currentColor"` | already theme-safe, no change |
| `app.js`, `planner.js`, `courses.js`, `movements.js` | no hex/rgba literals and no `style.color/background` assignments found (grep) | none. Re-grep at implementation time. |
| `<img>` everywhere (`app.js:116,269,537,640,696`, `planner.js:225,354,537`, `courses.js:136,220,236,242`, `movements.js:113`) | remote/white-background PNGs | `filter: var(--img-filter)` on content images, see 6.3 |
| `index.html:223-245` Profile panel | form markup | add theme picker above the form |
| `style.css` | no `prefers-color-scheme` or `forced-colors` rules today | add the `forced-colors` block (6.5) |

### 4.3 Small-text colour rule

Tokens used for **text** must pass on the surface they sit on, so `danger` is a fill/border/icon colour and `danger-text` is the text colour where `danger-soft` is the background. In the default theme `danger-text` can stay `#b91c1c` (already used by the row menu) and be applied to `.error`/`.server-error` only if the owner accepts the refinement.

## 5. Implementation plan

### 5.1 Where the theme is applied

- Attribute `data-theme="<id>"` on `<html>`, plus `data-theme-pref="auto|default|dark|..."` is optional (the pref lives in storage; only the *resolved* id goes on `<html>` so CSS stays simple).
- Storage: `localStorage['innodigym_theme']` = `auto` | `default` | `dark` | `ember` | `tide` | `graphite`. DECIDED: missing or invalid -> `auto` (follow the OS) for everyone, including existing users. The key is local only, never synced.
- **No flash:** a tiny blocking inline `<script>` in `<head>`, placed *before* `<link rel="stylesheet">`:

```html
<script>
(function () {
  var META = { default:"#f4f6fb", dark:"#0e1523", ember:"#faf4ec", tide:"#eef3fa", graphite:"#ececee" };
  var pref = "auto";
  try { pref = localStorage.getItem("innodigym_theme") || "auto"; } catch (e) {}
  var id = pref;
  if (pref === "auto") {
    id = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
  }
  if (!META[id]) id = "default";   // unknown stored value -> safe fallback
  var h = document.documentElement;
  h.setAttribute("data-theme", id);
  h.style.colorScheme = id === "dark" ? "dark" : "light";
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", META[id]);
})();
</script>
```
  The meta tag must precede the script in `<head>` (it already is above the stylesheet). DECIDED: no CSP is in place, so the inline script is fine.
- Runtime module `static/theme.js` (loaded after `i18n.js`, before `app.js`): `Theme.get()`, `Theme.set(pref)`, `Theme.list()`; `set` writes storage, recomputes the resolved id, updates `<html>`, `color-scheme`, meta theme-color, dispatches `themechange`. Listens to `matchMedia("(prefers-color-scheme: dark)")` `change` and, only when pref is `auto`, re-resolves. Listens to the `storage` event so a second tab follows. The id->meta map exists in both boot script and module; to avoid duplication the module can read the meta colour from `getComputedStyle(document.documentElement).getPropertyValue("--meta-theme-color")` (add `--meta-theme-color` to each theme block) so only the CSS holds the value. Recommended: do that and keep a hard-coded fallback in the boot script only for the first paint.
- `color-scheme`: set in each theme block (`light`/`dark`) so native scrollbars, date picker, `<select>` popup, autofill and form-control default colours match. Keep `html { color-scheme: ... }` driven by the same attribute; also add `<meta name="color-scheme" content="light dark">` so the very first paint (before CSS) has no white flash on dark.
- Transition: none on load. Optional 150 ms `background-color/color/border-color` transition only while switching (add a temporary class `theme-switching` on `<html>` for 200 ms) so normal hover transitions are unaffected and reduced-motion users get none (`@media (prefers-reduced-motion: reduce)`).

### 5.2 CSS structure

- New `static/themes.css`, linked **before** `style.css`; contains only the five token blocks + `html { color-scheme }` rules + `--meta-theme-color`. `style.css` keeps layout/components and loses its `:root` colour block and the second `:root` (Plans). Keeping tokens in a separate file lets the preview/test script parse it.
- Selector form: `:root, :root[data-theme="default"] { ... }` for the default (so a missing attribute still renders correctly), `:root[data-theme="dark"]` etc. for the rest. No `@media (prefers-color-scheme)` inside CSS: Auto is resolved in JS so there is one mechanism. For no-JS users the default theme applies.
- Rule: after migration `grep -nE '#[0-9a-f]{3,8}\b|rgba?\(' static/style.css` must return only the `--media-*` constants in the shared `:root`. Add that grep to QA, ideally to the contrast script.
- Per-theme overrides that are not colour (Graphite: `button, .chip { border-color: var(--text) }` for stronger edges; `[data-theme="graphite"] a { text-decoration: underline }`) live at the end of `themes.css` under a "theme-specific tweaks" heading and stay tiny.
- Focus: replace the mixed focus styles with one rule `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }` (keeping `--ring` as extra glow on inputs). Needed so focus is visible on filled primary buttons in dark (halo alone is `rgba` and weak) and meets 3:1.
- Forced colors: `@media (forced-colors: active) { ... }` leave system colours in charge (borders on cards/chips, `outline` keeps working since it is not a shadow). Do not use `box-shadow`-only focus indicators there.

### 5.3 Images and gradient cards in dark

- Exercise/course/cover images are remote PNGs, many with opaque white backgrounds. On a dark surface they become bright tiles. Treatment: (1) `filter: var(--img-filter)` (`brightness(.9)`) on `img` inside `.thumb`, `.picker-row`, `.cs-img`, `.cs-hero`, `.cs-step`, `.cover-*`, `.pl-thumb`, `.pl-cover`, `#lightbox-media`; (2) keep their rounded corners and add a 1px `var(--border)` so the tile reads as an object; (3) *do not* invert or use `mix-blend-mode` (it ruins photos). In the lightbox leave filter `none`: the user wants to see the true image on the dark scrim.
- `.mv-card` / `.cs-card` are photo cards with white text over a dark fade, already theme independent (constant dark fade). In dark the card border becomes visible lighter outline; `.mv-card` background `surface-2` shows during image loading (skeleton) which is fine. `.cs-card` body uses `surface`/`text` tokens so it flips naturally.
- Gradient brand mark: three brand stops per theme; glyph colour `--brand-fg` (dark ink on Midnight's bright mint).
- Body glows: dark uses low-alpha glows (`.05/.09`) so it doesn't look hazy.
- Skeleton pulse (`mv-pulse`) is opacity-based, works as is.

### 5.4 Profile screen picker

Placement: first block inside `#tab-profile`, **above** `#profile-form`, under the `<h2>`, in its own `<fieldset class="theme-picker">` (not inside the form, so Save changes does not include it, and a change applies instantly).

```html
<fieldset id="theme-picker" class="theme-picker">
  <legend>Theme</legend>
  <p class="hint-sm">Saved on this device only.</p>
  <div class="theme-grid" role="radiogroup" aria-label="Theme">
    <label class="theme-card">
      <input type="radio" name="theme" value="auto">
      <span class="theme-mini"> <!-- mini preview, aria-hidden --> </span>
      <span class="theme-name">Auto</span>
      <span class="theme-desc">Follows your device</span>
    </label>
    <!-- default, dark, ember, tide, graphite likewise -->
  </div>
</fieldset>
```

- **Semantics:** native `<input type="radio">` visually hidden but focusable (the card is the `<label>`), so the arrow keys, Space, and group Tab stop are free from the browser. Do not use `role="radio"` divs. The fieldset legend names the group. Checked state shown by `.theme-card:has(input:checked)` (2px primary outline + check mark), focus by `:has(input:focus-visible)` outline, plus a fallback class toggled in JS because `:has()` is not supported in older browsers (Safari < 15.4, Firefox < 121): the app already uses `:has` on line 641, so the same baseline applies.
- **Mini preview:** pure CSS, a swatch card painted with that theme's own tokens by putting `data-theme="<id>"` on the `.theme-mini` element itself (token blocks are selector `[data-theme=x]` so they scope to any element, which is exactly what `theme-preview.html` does). Contains a bar in `--primary`, a surface card with two text lines and an accent dash, over `--bg`. The Auto card is a diagonal split of default and dark minis. Use theme **names untranslated** (Teal Classic, Midnight, Ember, Tide, Graphite are proper nouns), only Auto/Theme/descriptions are translated.
- **Behaviour:** on `change` -> `Theme.set(value)`; instant, no Save click, no toast needed (optionally a polite `aria-live` text "Theme: Midnight"). No API call. On entering the Profile tab, check the radio matching `Theme.get()`. Logout does not reset the theme (device preference).
- **Layout:** grid `repeat(auto-fit, minmax(140px, 1fr))`, 2 columns at 320 px, 3 on tablet, 6 in one row on laptop if space allows. Touch target is the full card (>= 44 px).
- Keep the picker visible while the profile form is loading/offline (it is client-only).

### 5.5 i18n keys (EN key -> ES value; EN text is the key, per `i18n.js` convention)

| EN (key) | ES |
|---|---|
| Theme | Tema |
| Saved on this device only. | Se guarda solo en este dispositivo. |
| Appearance | Apariencia |
| Auto | Automático |
| Follows your device | Sigue el ajuste de tu dispositivo |
| Teal Classic | Teal clásico |
| Midnight | Medianoche |
| Ember | Brasa |
| Tide | Marea |
| Graphite | Grafito |
| The current look, fresh teal with a lime spark | El aspecto actual, verde azulado fresco con un toque lima |
| Deep dark theme, easy on the eyes at night | Tema oscuro profundo, cómodo para la vista de noche |
| Warm amber-brown and sand | Ámbar tostado y arena cálidos |
| Cool, calm blue | Azul fresco y sereno |
| High contrast, black on white | Alto contraste, negro sobre blanco |
| Theme: {name} | Tema: {name} (aria-live announcement) |

DECIDED: theme names are translated (table above). The preview shows English. The existing Profile `<h2>` and labels already have keys.

### 5.6 Task list in a safe order (the app works after every step)

1. **Tokenise without changing look.** In `style.css` add the new tokens to `:root` with the *current* values (including `--on-primary:#fff`, etc.) and replace literals with `var()` per section 4. Visual diff must be zero (screenshot compare 5 screens at 375 and 1280). Merge the second `:root`.
2. **Extract** the token block to `static/themes.css` (`:root, [data-theme="default"]`); link it before `style.css` in `index.html`. Still zero diff.
3. **Add the other four blocks** to `themes.css` (nothing selects them yet). Still zero diff.
4. **Boot script + `<meta name="color-scheme">`** in `index.html` head. With storage empty it resolves to `default`: zero diff. Manually test by setting `localStorage.innodigym_theme` in DevTools, the whole app now themes.
5. **`static/theme.js`** + `<script>` tag (before `app.js`); no UI yet; test via console `Theme.set("dark")`.
6. **Dark/image/colour-blind polish (add icon cue to notes and errors):** `--img-filter` rules, focus unification, `forced-colors`, `.mv-ph` icon colour check; fix any remaining literal found by QA.
7. **Profile picker:** markup in `index.html`, styles in `style.css` (`.theme-picker`, `.theme-card`, `.theme-mini`), wire in `theme.js` (or a small block in `app.js` after profile render), i18n keys in `i18n.js`.
8. **Contrast script** `scripts/check-theme-contrast.js` (+ the literal-grep) run before each release.
9. QA checklist (section 7), then docs (README line about themes).

Files touched: `static/style.css` (large, mechanical), `static/themes.css` (new), `static/theme.js` (new), `static/index.html` (head + Profile markup + script tags), `static/i18n.js` (keys), optionally `app.js` (no changes expected; planner/courses/movements JS need none since they contain no colour literals). No server changes unless a CSP or static-file allow-list needs the two new files.

## 6. Risks and mitigations

- **Missed literal => unreadable dark UI** (e.g. white button text on mint). Mitigation: the grep rule, a dark-first QA pass, and tokenising before adding themes (step order above).
- **`!important` on `#toast.err`** (`color:#fff !important`, plus `.err {color: var(--danger) !important}` and `.ok`). `.err` text colour on the toast would clash; tokenise carefully and keep the specificity.
- **`:root` declared twice** (Plans section). Must be merged or the second block's `--warn*` would override per-theme values (a `:root` rule later in the cascade beats `:root[data-theme]`? No: `:root[data-theme=x]` has higher specificity, but the default selector `:root` loses to the second `:root` only in the default theme, which is fine; still, delete it).
- **Specificity of the default block.** Using `:root, :root[data-theme="default"]` is lower specificity than `:root[data-theme=...]` so other themes win; keep that ordering.
- **Colour-blind safety (Ember and all themes).** Ember's primary is now a dark amber-brown, but brown, olive-yellow and crimson text can still look alike in lightness for red-green deficiencies. Notes and errors therefore need a non-colour cue: add a small icon or prefix (warning triangle / x-circle / info) to `.pl-note`, `.pl-note.warn`, `.server-error`, `.error`; and keep tinted-block-plus-border vs solid-fill as the structural difference. Verify Ember with the Chrome DevTools vision-deficiency emulation (protanopia, deuteranopia, tritanopia) during QA.
- **Dark and white-background PNGs.** `brightness(.9)` softens but does not remove glare; the alternative (white "mat" with padding) wastes space. Needs QA on real data.
- **Graphite's strong borders may feel heavy**; it is the accessibility theme by design.
- **Flash of the wrong theme** if the inline script is moved to `defer` or loaded late. Keep it inline and first in `<head>`.
- **`color-scheme` and `<select>` popups / `input[type=date]`** differ by OS; verify the date picker icon in dark (Chrome renders it light with `color-scheme: dark`).
- **`:has()` use** for radio card state: same support floor as the existing planner CSS.
- **Browser chrome colour:** `meta theme-color` changes are ignored by some desktop browsers and cached by iOS Safari until reload; harmless.
- **Auto + manual race:** when `pref=auto` and the OS flips while the page is open, handled by the `matchMedia` listener; when pref is explicit, listener is ignored.
- **Contrast of the unchanged default** has known gaps (section 3.3); changing them is a product call.

## 7. QA checklist (repeat for all 5 themes + Auto with OS light and OS dark)

Per theme:
- [ ] Reload with each theme stored: no flash of default before the themed page (throttle CPU 6x, hard reload).
- [ ] First load with no key and no JS error: default theme, identical to today (pixel compare).
- [ ] **Login** screen: card, inputs, primary button, error text, `lede` text; autofill colour in dark (Chrome yellow/blue autofill background must not leave dark text on dark field; add `input:-webkit-autofill` box-shadow inset fix if needed).
- [ ] **Programs** list cards and **editor table**: headers, row hover, inline number inputs (rest/hover/focus), drag handle, drop-before/after lines, row menu (and its danger item), reorder buttons disabled state, cover thumb + cover badge, cover modal selected ring.
- [ ] **Courses**: segmented control, topic chips, filter panel, badge, cards (hover shadow), course modal with hero, steps, placeholder icons, skeleton.
- [ ] **Movements**: search icon + input, filter chips, count text, photo grid with caption fade, empty state, "load more" secondary button, skeleton.
- [ ] **Plans wizard**: stepper (active/inactive/num), step 1 covers selected ring, chips pressed/unpressed, step 2 routine rows + drag states + official chip + normal chip, step 3 calendar days (selected, empty/warn, hover on empty), notes (info/warn), footer.
- [ ] **History / Actions / Fitness** list cards.
- [ ] **Profile**: picker radio navigation with arrows, Space selects, visible focus, persists after reload, applies instantly, does not fire any network request (check Network tab), form fields incl. disabled inputs and date input icon.
- [ ] **Modals**: action picker (search, chips, rows hover), lightbox (scrim strength, image brightness), backdrop blur, `pop` animation.
- [ ] **Toast** ok and error, readable in each theme.
- [ ] **Mobile tab bar** at 320, 375 and 414 px: translucent bar over scrolled content, active pill, safe-area padding, labels not clipped, icon colour (currentColor).
- [ ] **Focus rings** on button, secondary button, chip, tab, card, row-menu item, input, radio card: visible on every background (3:1), not clipped by `overflow:hidden` ancestors.
- [ ] **Hover/active/disabled** states: buttons (`.5` opacity disabled still legible? it is exempt but must look disabled), chips, cards, tabs.
- [ ] Images: white-bg PNG tiles in dark are not glaring; broken-image alt fallback colour.
- [ ] Switch theme while a modal is open and while the toast is visible: all update without reload.
- [ ] Two tabs open: change in one updates the other (`storage` event).
- [ ] OS flips light/dark while pref=Auto: live update; with explicit pref: no change.
- [ ] Scrollbars, `<select>`, date picker native UI match the scheme.
- [ ] ES language: picker labels not truncated (longer strings) at 320 px.
- [ ] Windows High Contrast / `forced-colors`: text, borders, focus visible.
- [ ] Run the contrast script and the literal grep: both clean.
- Print: out of scope.

## 8. Product owner decisions (all open questions resolved)

1. New-user default preference: **Auto**. (Existing users with no stored key also resolve to Auto.)
2. Accessibility refinements to Teal Classic: **accepted** (applied in the token table; section 3.3).
3. Theme names: **translated** (Medianoche, Brasa, Marea, Grafito; Teal Classic gets a Spanish label too, e.g. "Teal clásico").
4. `meta theme-color`: **matches the page background** per theme.
5. Ember: **reworked to a deeper amber-brown primary**, colour-blind-conscious, with non-colour cues for status.
6. True-black OLED theme: **not wanted**.
7. CSP blocking inline scripts: **none**, inline boot script is fine.
8. Account sync: **no**, theme stays in `localStorage['innodigym_theme']`.

## 8b. Logo concept (from `~/Downloads/Minimal Functional Trainer App Icon.png`)

The source image is a monochrome near-black functional trainer (arched frame with two pulley carriages, a screen column, a triangle handle on the left cable) with a seated figure pulling the right-hand cable handle, on a white rounded tile with a soft drop shadow.

Proposal:
- **Theme-aware glyph.** The logo is drawn with `currentColor` and one `--logo-cut` variable (the colour of the thin separation lines on the figure), so a single SVG serves every theme: `.brand-mark` keeps its gradient tile (`--brand-1/2/3`) and the glyph takes `--brand-fg` (white on light themes, dark ink on Midnight). In the app the SVG is inlined in `index.html` replacing the dumbbell inside `.brand-mark` (and the `DUMBBELL` placeholder in `courses.js` / `movements.js` can stay, it is a different use: image placeholder).
- A first hand-drawn simplification is in `docs/logo-concept.svg` and shown in `docs/theme-preview.html` (top section and every panel's header). It reads at 40 px and 27 px; at 27 px the cable details are the first to disappear, which is acceptable. It is a concept trace, not final art.
- **Production art.** For a faithful mark, vectorise the provided PNG (for example `potrace` on a thresholded copy, or have a designer redraw it) as a single-path, `currentColor` glyph with the shadow and white tile removed; keep the figure + machine silhouette and drop the thin highlight strokes below 1.5 px at 64 px.
- **Other assets** derived from the same art: `favicon.svg` (glyph on the default teal tile, with `prefers-color-scheme` inside the SVG for the tab icon), a 192/512 px PNG for a future web-app manifest, and an Apple touch icon (glyph on solid `#0f766e`, no transparency). The tab-bar/header sizes need the simplified glyph; a detailed version can be used on the login screen (about 96 px).
- Contrast: the glyph sits on gradient stops that include lime, which is why the logo rows in section 3.2 are informational (logos are exempt from WCAG 1.4.11); the figure must still be recognisable, so keep `--brand-fg` and test the mark on `--brand-3` (lime/gold/cyan end).
- **DECIDED:** the logo replaces the dumbbell everywhere: header `.brand-mark`, login screen, favicon, and touch/manifest icons (`index.html` lines 15 and the login brand; the `DUMBBELL` image placeholder in `courses.js`/`movements.js` is a different use and stays unless the owner says otherwise).
- **DECIDED:** the login screen shows a two-tone colour version: figure in `--primary`, machine in `--text` (graphite in light themes, light ink in Midnight), cut-lines `--surface`. The header mark stays the single-colour glyph on the brand gradient tile. Task: add the logo SVG (`<symbol id="logo">` or inline) and a `.logo-hero` style using these tokens; no new colours needed.

## 9. Appendix: palette contrast script (reference)

Method: sRGB -> linear, `L = .2126R + .7152G + .0722B`, ratio `(L1+.05)/(L2+.05)`, `rgba` colours composited over the page `bg` first (tab bar). The intended repo script reads `themes.css`, builds each theme's token map by regex over `[data-theme]` blocks, and asserts the pair list of section 3.2 with their minimums.
