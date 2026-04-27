import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium text-zinc-500">Регистрация</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Создать организацию
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Первый пользователь становится владельцем организации.
        </p>
      </div>

      <AuthForm mode="register" />
    </div>
  );
}
