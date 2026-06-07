import type { ReactNode } from "react";
import { BusinessSnapshotGate } from "@/components/business-snapshot-gate";
import { safeGetBusinessSnapshot } from "@/lib/business-snapshots";

export default async function StandaloneReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const assortmentSnapshot = await safeGetBusinessSnapshot(
    "ASSORTMENT_ARRIVALS",
  );

  return (
    <>
      <div className="bg-[var(--background)] px-4 pt-4 text-zinc-950">
        <div className="mx-auto max-w-7xl">
          <BusinessSnapshotGate
            snapshot={assortmentSnapshot}
            type="ASSORTMENT_ARRIVALS"
          />
        </div>
      </div>
      {children}
    </>
  );
}
