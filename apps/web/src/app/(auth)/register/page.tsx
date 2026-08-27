import type { Metadata } from "next";
import { InviteRegistrationGate } from "@/components/invite-registration-gate";

export const metadata: Metadata = {
  referrer: "no-referrer",
};

export default function RegisterPage() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-zinc-500">Регистрация</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Принять приглашение
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Завершите регистрацию владельца сети или сотрудника. Роль и доступы
          уже настроены в приглашении; владельцу после входа будет показан
          чек-лист первичной настройки.
        </p>
      </div>

      <InviteRegistrationGate />
    </div>
  );
}
