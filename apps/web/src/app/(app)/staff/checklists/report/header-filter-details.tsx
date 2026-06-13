"use client";

import { useEffect, useRef, type ReactNode } from "react";

type HeaderFilterDetailsProps = {
  className?: string;
  panelClassName?: string;
  summary: ReactNode;
  summaryClassName?: string;
  children: ReactNode;
};

export function HeaderFilterDetails({
  className,
  panelClassName,
  summary,
  summaryClassName,
  children,
}: HeaderFilterDetailsProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const details = detailsRef.current;

      if (!details?.open) {
        return;
      }

      if (event.target instanceof Node && details.contains(event.target)) {
        return;
      }

      details.open = false;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      const details = detailsRef.current;

      if (details?.open) {
        details.open = false;
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className={className}>
      <summary className={summaryClassName}>{summary}</summary>
      <div className={panelClassName}>{children}</div>
    </details>
  );
}
