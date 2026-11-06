# UI/UX rules for `apps/web`

Read this guide before adding a screen, changing how something looks, moves or is
operated, or reviewing UI. It is a LeetPlus-specific digest of the public
[ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
rule set (v2.15.0, MIT), cut down to what applies to this stack and these users.
Loading states have their own contract: [loading UI guide](loading-ui.md).

## Who the screen is for

| Surface | Routes | Users and context | Bias |
|---|---|---|---|
| Corporate workspace | `(app)`, `/guests`, `/products`, `/reports` | Owners, managers, admins at a desk; long sessions, many numbers | Dense desktop layout, still usable at 375 px |
| Guest game | `/play`, `/game` (incl. Telegram Mini App), `/guest/[tenantSlug]` | Club guests on a phone, often one-handed, between matches | Mobile-first, large targets, short text |

Decide which one you are building before choosing density, sizes and motion.

## Existing design language (do not invent a new one)

- Tokens live in `app/globals.css`: `--background`, `--foreground`, `--surface`,
  `--surface-muted`, `--border-soft`, `--accent` (green), `--accent-strong`, with a
  `.dark` override. Neutral palette is Tailwind `zinc`; the accent is green.
- Dark mode is the `.dark` class (`@custom-variant dark`). Write explicit `dark:`
  pairs for new components. The `.dark .bg-white …` block is a transitional bridge
  for legacy screens; do not rely on it for new code.
- No new raw hex colors in components. Use the tokens or Tailwind palette classes;
  if a color is truly new, add a token to `globals.css` with light and dark values.
- Icons: `@phosphor-icons/react` only, one weight per context. No emoji as icons
  (emoji in user content or guest copy is fine).
- Charts: `recharts`. Fonts: the system stack (`--font-system-sans`); do not add web
  fonts.
- Copy is Russian (`<html lang="ru">`). Numbers, money and dates through
  `Intl`/`toLocaleString("ru-RU")`; `tabular-nums` in tables, KPIs, timers and
  prices so digits do not jump.

## Rules by priority

1. **Accessibility (critical).** Text contrast 4.5:1 (large text and UI parts 3:1)
   in both themes; check dark mode separately. Never remove focus without a
   replacement: `outline-none` must come with a `focus-visible:` ring. Icon-only
   buttons get `aria-label`; decorative icons next to text get `aria-hidden`.
   Use real `<button>`/`<a>`, not clickable `div`/`span`. Meaning is never color
   alone: status chips carry a word or icon too. Modals close on Esc and have a
   visible close button; focus goes into the modal and returns to the trigger.
2. **Touch and interaction (critical).** Guest surfaces: tap targets at least
   44×44 px with 8 px between them. Corporate: at least 24×24 px. Nothing important
   works only on hover. In Tailwind v4 buttons have the default cursor; add
   `cursor-pointer` to clickable elements. An async button is disabled and shows
   progress while pending, so it cannot be submitted twice.
3. **Performance and layout stability (high).** Reserve space for async content and
   images (`width`/`height` or `aspect-ratio`) so nothing jumps. Lazy-load heavy
   below-the-fold parts. Debounce search and filter input. Long lists (50+ rows)
   paginate or virtualize.
4. **Consistency (high).** Reuse existing components and patterns before writing a
   new one. One primary action per screen; secondary actions look secondary.
   Same shadow, radius and spacing scale as neighbouring screens.
5. **Responsive (high).** Check 375, 768, 1024 and 1440 px. No horizontal page
   scroll on phones; wide tables scroll inside their own container. Use `min-h-dvh`
   rather than `100vh`/`h-screen` for full-height mobile screens. Fixed bars reserve
   padding (and `env(safe-area-inset-*)` in the Telegram Mini App) for content
   underneath.
6. **Typography and color (medium).** Body text 14–16 px on corporate screens and
   at least 16 px for guest body copy and inputs (smaller inputs zoom on iOS).
   Keep 10–11 px text for secondary labels only, never for the value the user came
   for. Russian words are long: let labels wrap before truncating, use
   `min-w-0` on flex children and `overflow-wrap:anywhere` for IDs, emails and URLs.
   Truncated text must be reachable in full (title/tooltip/expand).
7. **Motion (medium).** Animate `transform` and `opacity`, not size or position.
   Every animation means something (state change, reward, arrival); one or two
   animated elements per view. Respect `prefers-reduced-motion` (`motion-reduce:`):
   no spin/shimmer/confetti, the result is shown immediately. Animations never
   block input, and state is set explicitly, not on `animationend`.
8. **Forms and feedback (medium).** Visible label for every input (placeholder is
   not a label). Validate on blur; show the error under the field, linked with
   `aria-describedby`, stating cause and fix («Введите телефон в формате +7…»,
   not «Неверный ввод»). Mark required fields. Submit shows pending, then success
   or an error with a way to retry. Empty states explain why it is empty and offer
   the next action. Destructive actions are red, separated from the primary action
   and confirmed; irreversible ones use the typed confirmation pattern (club
   deletion). Use `type="tel"`, `inputMode="numeric"`, `autoComplete` where they
   apply.
9. **Navigation (high).** Every screen worth sharing has a URL, including filters
   and tabs in search params. Back returns to the same scroll position and filters.
   The current section is highlighted in navigation. Do not hide an unavailable
   section silently when the user expects it; explain why (role, module, club).
   Do not use modals for primary flows.
10. **Charts and data (medium for us).** Trend → line, comparison → bar, share →
    bar or donut with at most five slices. Axes have units and the period
    granularity (день/неделя/месяц) is visible. Tooltips show exact formatted
    values. Legends are visible next to the chart. No data → an explicit empty
    state, failed load → an error with «Повторить», never a blank frame. A chart's
    key number is also present as text for screen readers.

## Before you hand over UI work

- [ ] Both themes checked; contrast holds in dark mode.
- [ ] 375 px and desktop width checked; no horizontal page scroll.
- [ ] Keyboard: Tab order follows the layout, focus is visible, Esc closes overlays.
- [ ] Icon-only controls have names; status is not color-only.
- [ ] Loading, empty, error and long-text states look right (long Russian labels,
      large numbers, a long club or guest name).
- [ ] Reduced motion leaves the screen usable and complete.
- [ ] No new raw hex, no new icon set, no new web font.
- [ ] Verified in a real browser per [verification](verification.md); screenshots
      in the PR for visible changes.
