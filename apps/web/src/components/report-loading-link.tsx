"use client";

import { useState } from "react";

export function ReportLoadingLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <a
      href={href}
      aria-busy={isLoading}
      onClick={() => setIsLoading(true)}
      className={["inline-flex items-center justify-center gap-2", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {isLoading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      <span>{isLoading ? "Загрузка..." : children}</span>
    </a>
  );
}
