import type { CSSProperties } from "react";

/**
 * A skeleton block. Give it the size and radius of the real block it stands
 * for so nothing jumps when the data arrives. `delay` staggers the shimmer.
 */
export function Sk({
  className = "",
  delay = 0,
  style,
}: {
  className?: string;
  delay?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={`lp-sk ${className}`}
      style={
        {
          ...(delay ? { "--d": `${delay}s` } : {}),
          ...style,
        } as CSSProperties
      }
    />
  );
}

/** Card shell shared by the screen skeletons. */
export function SkCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}
