import type { CSSProperties } from "react";

/**
 * The LP mark with an orbit: a green arc that circles the mark with a bright
 * "ping" dot at its head. Indeterminate by design, no percentage. `bare` drops
 * the mark and the glow for small inline uses.
 */
export function LoaderMark({
  size = 96,
  bare = false,
}: {
  size?: number;
  bare?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="lp-orbit"
      style={{ "--lp-size": `${size}px` } as CSSProperties}
    >
      {bare ? null : <span className="lp-orbit-glow" />}
      <span className="lp-orbit-track" />
      <span className="lp-orbit-arc" />
      <span className="lp-orbit-dot">
        <i />
      </span>
      {bare ? null : <span className="lp-orbit-mark">LP</span>}
    </span>
  );
}
