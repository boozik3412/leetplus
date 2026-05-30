import { AuthForm } from "@/components/auth-form";

type RegisterPageProps = {
  searchParams: Promise<{
    invite?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { invite } = await searchParams;
  const inviteToken = typeof invite === "string" ? invite : null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-zinc-500">Регистрация</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          {inviteToken ? "Принять приглашение" : "Создать организацию"}
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          {inviteToken
            ? "Завершите регистрацию сотрудника. Роль и доступы уже настроены в приглашении."
            : "Первый пользователь становится владельцем организации. После создания мы отправим письмо для подтверждения email."}
        </p>
      </div>

      <AuthForm mode="register" inviteToken={inviteToken} />
    </div>
  );
}
