import { Suspense } from "react";
import { VerifyEmailPanel } from "@/components/verify-email-panel";

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-zinc-50 px-6 py-10 text-zinc-950">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
              Загрузка подтверждения...
            </div>
          }
        >
          <VerifyEmailPanel />
        </Suspense>
      </div>
    </main>
  );
}
