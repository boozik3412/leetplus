import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-zinc-500">Вход</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Продолжить работу
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Войдите, чтобы открыть данные своей организации.
        </p>
      </div>

      <AuthForm mode="login" />
    </div>
  );
}
