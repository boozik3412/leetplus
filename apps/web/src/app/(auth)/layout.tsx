import { LegalEntityInfo } from "@/components/legal-entity-info";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen flex-1 bg-zinc-50 text-zinc-950">
      <section className="hidden w-1/2 border-r border-zinc-200 bg-white px-12 py-10 lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            LeetPlus
          </p>
          <h1 className="mt-6 max-w-lg text-4xl font-semibold tracking-tight">
            Управление ассортиментом как рабочий инструмент роста прибыли.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-zinc-600">
            Авторизация привязывает пользователя к организации и подготавливает
            интерфейс к мультитенантной модели.
          </p>
        </div>
        <LegalEntityInfo compact />
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md space-y-4">
          {children}
          <LegalEntityInfo compact className="lg:hidden" />
        </div>
      </section>
    </main>
  );
}
