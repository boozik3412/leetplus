import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { redirectIfAuthenticated } from "@/lib/auth";

type RegisterPageProps = {
  searchParams: Promise<{
    invite?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  await redirectIfAuthenticated();

  const { invite } = await searchParams;
  const inviteToken = typeof invite === "string" && invite.length > 0 ? invite : null;

  if (!inviteToken) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-zinc-500">Регистрация</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Регистрация только по приглашению
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Самостоятельное создание организации временно отключено. Попросите
            администратора выдать приглашение или войдите в уже созданную
            учетную запись.
          </p>
        </div>

        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-zinc-500">Регистрация</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Принять приглашение
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Завершите регистрацию сотрудника. Роль и доступы уже настроены в
          приглашении.
        </p>
      </div>

      <AuthForm mode="register" inviteToken={inviteToken} />
    </div>
  );
}
