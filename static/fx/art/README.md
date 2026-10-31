# FX art set (FitMas / HallowFit)

Hand-authored decorative SVGs. viewBox only, no title (JS sets aria-hidden), no filters; glows are radial gradients (ids are prefixed with the file name so inlining many is safe).
Colours: `var(--fx-NAME, #fallback)`.
- HallowFit tokens: `--fx-pumpkin --fx-pumpkin-d --fx-purple --fx-purple-d --fx-slime --fx-bone --fx-ink --fx-stone --fx-stone-hi --fx-candy-y`
- FitMas tokens: `--fx-cranberry --fx-cranberry-l --fx-pine --fx-pine-d --fx-gold --fx-gold-d --fx-snow --fx-ice --fx-flake --fx-icicle-edge --fx-spark --fx-wire --fx-socket`; bulbs `--bulb-1..4`.

Inline them (fetch + innerHTML) for CSS vars and animation to work; `<img>` only shows fallbacks. `preview.html` (serve over http) shows all assets on both backgrounds.

## HallowFit
| file | viewBox | use | animatable |
|---|---|---|---|
| web-corner | 0 0 64 64 | top-left corner cobweb, stroke currentColor; mirror with scaleX(-1) | `.web` |
| spider | 0 0 48 56 | hangs from top; thread attaches at (24,0) | `.thread` (scaleY to drop), `.legs-l`, `.legs-r`, `.body`, `.eyes` |
| pumpkin | 0 0 64 60 | plain pumpkin | `.stem`, `.body` |
| jack-o-lantern | 0 0 64 60 | lit face | `.face` > `.glow` paths (flicker), `.glow-halo` ellipse, `.stem`, `.body` |
| bat | 0 0 48 24 | spread-wing flyer | `.wing-l`, `.wing-r` (rotate/scaleY about x=24,y=12), `.body` |
| ghost | 0 0 48 56 | floaty ghost | `.glow` halo, `.body`, `.eyes` |
| eyes-in-dark | 0 0 56 24 | glowing eyes | `.glow`, `.eye` x2 (blink via scaleY) |
| tombstone | 0 0 40 52 | decoration | `.rip` |
| candy-corn | 0 0 32 48 | decoration | whole |
| bat-logo-accent | 0 0 28 16 | ~28px bat perched on logo top | `.wing-l`, `.wing-r`, `.body` |

## FitMas
| file | viewBox | use | animatable |
|---|---|---|---|
| light-string | 0 0 160 24 | wire + 9 bulbs; `<symbol id="bulb">` reused via `<use>` with inline `color: var(--bulb-N, fallback)` | `.wire`, `.bulbs` > use (twinkle via opacity); in symbol `.bulb`, `.bulb-glow` |
| ornament | 0 0 40 52 | hanging ball, string top at (20,0) | `.ball`, `.hang`, `.string` (swing about 20,0) |
| garland | 0 0 128 56 | curved pine bough | `.bough`, `.needles`, `.berry` |
| santa-hat | 0 0 48 44 | tilt on logo corner (~36px) | `.hat`, `.brim`, `.pom` |
| holly | 0 0 48 48 | leaves + berries | `.berries` |
| candy-cane | 0 0 32 56 | decoration | whole |
| snowflake-1/2/3 | 0 0 48 48 | falling flakes | `.flake` (rotate) |
| snow-cap | 0 0 128 20 | uneven snow lip, tile horizontally (ends match at y=6); white, needs a coloured surface behind | `.snow` |
| icicle | 0 0 16 40 | single | whole |
| icicle-row | 0 0 ~104 48 | 8 varied icicles | `.icicles` |
| star | 0 0 48 48 | star with glow | `.glow`, `.star` |
| sparkle | 0 0 32 32 | 4-point twinkle | `.spark` (scale/rotate) |
| gift | 0 0 48 48 | present | `.bow`, `.ribbon` |
