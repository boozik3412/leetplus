# Loading UI

Owner decision 30.09.2026: one waiting language for every heavy screen. Concept and
mockup: the LP mark with an orbit and a "ping" dot, four data sources, skeletons that
repeat the page layout. No percentages: the server reports no progress, so nothing
shows one.

## Parts (`apps/web/src`)

- `app/loading-indicator.css`: all styles and keyframes (`lp-*`), theme tokens
  (`--lp-*`), reduced motion. Imported by `globals.css`.
- `components/loading/loader-mark.tsx`: `LoaderMark` (orbit, `bare` for small uses).
- `components/loading/skeleton.tsx`: `Sk` (a block: give it the real block's size and
  radius, `delay` staggers the shimmer) and `SkCard`.
- `components/loading/loading-region.tsx`: client wrapper of a skeleton. Screen-reader
  status text; after 6 s a floating «Считаем дольше обычного» notice, after 45 s an
  error with «Повторить». The notices float (`sticky` + zero height), so nothing shifts.
- `components/loading/brand-loader.tsx`: `BrandLoader` (mark, rotating status, four
  sources, rotating product tips). Root `app/loading.tsx` (full screen) and
  `app/(app)/loading.tsx` (generic fallback).
- `components/loading/summary-skeleton.tsx`, `screen-skeletons.tsx`: `SummarySkeleton`,
  `AssortmentSkeleton`, `GuestsSkeleton`, `TableSkeleton` (reports), `PageSkeleton`
  (generic heavy page), `DetailsSkeleton`.
- `components/navigation-feedback.tsx` + `lib/navigation-labels.ts`: the route bar
  and the pill. Listens to clicks in the **capture** phase: by the bubble phase Next's
  `Link` has called `preventDefault` and the bar would never start. The pill is named
  from the destination (`navigationLabel`) or from `data-nav-label` on the link;
  after 6 s it adds «Считаем дольше обычного»; it ends when the route changes, or after
  45 s. `data-nav-feedback="off"` on a link opts it out.
  `startNavigationFeedback(label, { veil: true })` is for a `router.push` on the same
  page (filters).
- Filter veil: regions with `data-lp-veil-target` keep their old numbers dimmed, with a
  soft sweep, while `startNavigationFeedback(..., { veil: true })` is pending
  (`<html data-lp-veil="on">`). Used on the executive grid and the assortment sections.
- `components/executive-link.tsx`: summary links; the tapped card pulses.

## Adding a heavy screen

1. Add `loading.tsx` to the route segment and render a skeleton with the page's real
   container classes and static headings; shimmer only the data.
2. A loading boundary shows its fallback only when navigation enters a segment that
   has its own `loading.tsx`. Two routes under one boundary swap content without a
   fallback, so give each heavy child route its own `loading.tsx`.
3. A change of search params only (filters) never shows the fallback: call
   `startNavigationFeedback` with `{ veil: true }` and mark the content
   `data-lp-veil-target`.
4. Add the route to `ROUTE_LABELS` in `lib/navigation-labels.ts` (and its test).

## Rules

- Text contrast 4.5:1 in both themes; the skeleton is `aria-hidden`, the region has a
  status text.
- `prefers-reduced-motion`: no rotation, no shimmer, the text stays.
- Never invent progress, counts or percentages in a loading state.
