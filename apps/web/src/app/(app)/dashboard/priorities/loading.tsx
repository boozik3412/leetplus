import { PageSkeleton } from "@/components/loading/screen-skeletons";

export default function PrioritiesLoading() {
  return <PageSkeleton label="Загружаем приоритеты." kpis={3} />;
}
