import { LangameSettingsForm } from "@/components/langame-settings-form";
import { requireCurrentUser } from "@/lib/auth";
import { getLangameSettings } from "@/lib/langame-settings";
import { can } from "@/lib/permissions";

export default async function SettingsPage() {
  const user = await requireCurrentUser();

  if (!can(user, "manage_integrations")) {
    return (
      <main className="px-6 py-8 text-zinc-950">
        <div className="mx-auto max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Нет доступа</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Управление интеграциями доступно только владельцам и
            администраторам сети.
          </p>
        </div>
      </main>
    );
  }

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
