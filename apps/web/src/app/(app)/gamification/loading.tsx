import { LoadingRegion } from "@/components/loading/loading-region";
import { Sk } from "@/components/loading/skeleton";

export default function GamificationLoading() {
  return (
    <LoadingRegion label="Загружаем геймификацию.">
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="space-y-3">
            <Sk className="h-4 w-40" />
            <Sk className="h-9 w-96 rounded-xl" delay={0.1} />
            <Sk className="h-5 w-full max-w-3xl" delay={0.2} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Sk className="h-32 rounded-xl" />
            <Sk className="h-32 rounded-xl" delay={0.1} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 0.1, 0.2, 0.3].map((delay) => (
              <Sk key={delay} className="h-28 rounded-xl" delay={delay} />
            ))}
          </div>
          <Sk className="h-12 w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Sk className="h-72 rounded-xl" />
            <Sk className="h-72 rounded-xl" delay={0.15} />
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}
