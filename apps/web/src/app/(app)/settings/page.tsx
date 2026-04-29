import { LangameSettingsForm } from "@/components/langame-settings-form";
import { requireCurrentUser } from "@/lib/auth";
import { getLangameSettings } from "@/lib/langame-settings";

export default async function SettingsPage() {
  await requireCurrentUser();
  const langameSettings = await getLangameSettings();

  return (
    <main className="px-6 py-8 text-zinc-950">
      <div className="mx-auto max-w-7xl">
        <div>
          <h1 className="text-2xl font-semibold">Настройки</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Управление интеграциями tenant. Здесь пользователь сети клубов
            подключает свой API-ключ, а данные сохраняются только в рамках его
            организации.
          </p>
        </div>

        <LangameSettingsForm initialSettings={langameSettings} />
      </div>
    </main>
  );
}
