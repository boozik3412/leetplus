import Link from "next/link";
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

      <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-950">
          Хотите участвовать в клубных квестах?
        </p>
        <Link
          className="mt-3 flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-700"
          href="/play"
        >
          Перейти к регистрации гостя
        </Link>
      </div>
    </div>
  );
}
