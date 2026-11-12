import { PageSkeleton } from "@/components/loading/screen-skeletons";

// Without its own boundary the audit fell back to the full-screen BrandLoader
// of (app)/loading.tsx and looked heavier than the neighbouring reports.
export default function CommercialAuditLoading() {
  return <PageSkeleton label="Загружаем коммерческий аудит." />;
}
