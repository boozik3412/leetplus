import { AuthForm } from "@/components/auth-form";
import { redirectIfAuthenticated, sanitizeReturnTo } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{
    returnTo?: string | string[];
  }>;
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(searchParam(params.returnTo));

  await redirectIfAuthenticated(returnTo);

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

      <AuthForm mode="login" returnTo={returnTo} />
    </div>
  );
}
