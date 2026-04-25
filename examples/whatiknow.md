# What I know

A rules document distilled from 64 Claude Code sessions and 1,431 user messages (287 matched the feedback filter, window: 6mo).

Project: `~/work/portfolio`
Generated: 2026-04-19

---

## Motion & Animation

**Easing & timing**

- Use `cubic-bezier(0.22, 1, 0.36, 1)` as the default ease-out for entrance motion. **Why:** the project's signature curve, used everywhere consistent transitions matter.
- Never set `transition: all`. Name the exact properties.
- Default UI transitions: 150–250ms. For fades that hide repositioning (maps, large media), 200ms.
- Avoid `ease-in` and `ease-in-out` for entrance animations. They feel sluggish.
- Don't use bounce by default. If used at all, keep it tiny.

**Hover & tap states**

- Never use `transform: scale()` for hover. Reserve scale for active/press only.
- Wrap all hover styles in `@media (hover: hover)` so they don't stick on mobile.
- Hover exits must feel reactive. Don't apply long inline transition durations to the resting state.
- Use `scale(0.97)` minimum for press states. Never animate from `scale(0)`.

**Drag & gestures**

- Set `transition: none` while dragging so scrubbing tracks the cursor 1:1.
- Restore springs only on non-drag programmatic updates.
- Don't let drag cause layout shift in the surrounding page.

**Drawer/modal motion**

- Popovers must scale from the trigger origin via `transform-origin`.
- Add edge detection so popovers flip when clipped at the viewport edge.
- Anchor popovers as direct children of relative-positioned wrappers. Avoid portals — they consistently render too far from triggers.
- Don't close popovers on outside click while the user is mid-action.

**Blur-fade vs morph**

- Prefer 100–200ms blur+fade-out → blur+fade-in over morphs that look unstable.
- Use shared `layoutId` (FLIP) instead of `AnimatePresence mode="wait"` when source and target are visually continuous.
- Don't morph between drastically different sizes. Let exiting items scale up when going to a larger view.

**Spring physics**

- Default spring: `stiffness 400, damping 30`.
- For non-drag slider/programmatic updates, use spring `(300, 28)` — never `duration: 0`.
- Don't reach for springs for simple opacity/color changes.

---

## Visual Craft

**Typography**

- Cap font weight at 500/600. Never `<b>`, `<strong>`, `font-bold`, or 700+.
- Body text is 14px on portfolio pages. 12–13px for control panels. 16px is the cap on dense surfaces.
- Use `tabular-nums` for any number that animates or counts.
- Apply `text-wrap: balance` to all H1/H2 headings.
- Apply `text-wrap: pretty` to body paragraphs.
- Never put outline or stroke on text.
- Disable `user-select` and `pointer-events` on every non-interactive text layer.

**Voice & copy**

- No em dashes anywhere. Rephrase or use period/comma.
- Never ALL CAPS.
- Use contractions always.
- Use "click" for UI actions. Never "tap", "press", "mash", "hit" for buttons.
- Never use words like "curated", "perfect", "amazing", "feel free to", "please don't hesitate".

**Color & palette**

- Idle controls = 50% white. Hover = 64%. Active = accent color.
- Page background: white. Demo containers: `#fafafa`. Dark variant: `#121212`.
- Use OKLCH for all color tokens.
- Code snippet cards: `#fafafa` bg with dark text. Never dark bg with white text.

**Borders & radius**

- Bump radii ~50% from default Tailwind feel (8 → 12).
- Concentric radius rule: child radius = parent radius − gap.
- 12px radius on all media thumbnails and demo containers.
- No strokes/boxy outlines for compare/split layouts. Use width split + 24px gap instead.

**Spacing**

- Use Fibonacci spacing (`F[6]=8, F[10]=55, F[12]=89` …).
- Standard gaps: split halves 24px, popover-to-trigger 12px, toolbar-to-settings-panel 8px+.
- Showcase containers: 96vh height, 80% page width, max-width 1200px.

---

## Components

**Buttons**

- Three real states: idle 50% white → hover 64% → active = accent color.
- Active buttons recolor the icon itself, no bg fill.
- Press scale: `scale(0.97)` minimum.
- Buttons must inherit font (`font: inherit`) — they don't by default.

**Tabs & toggles**

- Fluid floating background that slides under the active tab. Not snap-jumping per tab.
- Indicator must NOT bridge intermediate tabs. Use `layoutId` shared layout, not width interpolation.
- Tab text must clip against the moving indicator.
- Tabs must not jump on first render. Guard initial position behind a `ready` state.

**Sliders**

- `transition: none` while dragging. Spring `(300, 28)` on programmatic updates.
- Active track: solid color, not gradient or embossed.
- All sliders in one panel share the same height.

**Modals & drawers**

- Dim the entire page including the top bar. Only the active trigger excludes itself.
- Don't close drawers/panels on outside click for precision actions. Use scroll-down + explicit close button.
- Mobile modal close: top-right above the thumbnail.

**Tooltips & popovers**

- Initial hover delay; skip delay on subsequent hovers within a session.
- Origin-aware scale + viewport edge detection.
- Don't auto-close on selection.

---

## Implementation & Process

**Libraries**

- Framer Motion for all UI animations. Don't reach for React Spring or GSAP for new work.
- Use shared `layoutId` (FLIP) instead of `AnimatePresence mode="wait"` for layout morphs.
- OKLCH/OKLAB for color. Don't use Spectral or other color spaces in production.

**React patterns**

- `useState` (not `useRef`) for any value JSX style/transition reads.
- Don't mix shorthand and non-shorthand for the same property (`border` and `borderColor`). Set them separately.
- Anchor popovers/inspectors to the viewport when they need to escape clipping ancestors.

**Assets**

- Videos: autoplay, mute, loop in view.
- Don't compress or re-encode the user's source files. Preserve quality.
- Default to `.webm`. If it flickers, swap to `.mov`.
- Lazy-load big media. Pre-measure dimensions before paint to avoid layout shift.

**Scope & commits**

- Only stage and push files for the pages/features the user explicitly named.
- Never amend or force-push without an explicit ask. Create a new commit.
- Audits/reviews list findings only. Don't implement until approved.

**Verification**

- Verify visible/visual changes in the browser before declaring done.
- After a fix, confirm the original symptom is gone AND nearby behavior didn't regress.
- Type-check only changed files. Pre-existing errors elsewhere aren't your scope.

**Response style**

- Short. Minimum words to convey the point. No preamble, no recap.
- Don't pre-decide. Show options as a numbered list, let the user pick.

**Never without permission**

- Refactor, rename, or reformat outside the requested scope.
- Compress or replace user media.
- Add scale-on-hover, dropdown menus, or auto-play sounds.
- Push to `main`, delete branches, run destructive Git operations.
