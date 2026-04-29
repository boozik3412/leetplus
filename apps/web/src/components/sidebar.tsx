"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import { canAccessPath } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/admin", label: "Админ платформы" },
  { href: "/dashboard", label: "Дашборд" },
  { href: "/products", label: "Товары" },
  { href: "/categories", label: "Категории" },
  { href: "/suppliers", label: "Поставщики" },
  { href: "/stores", label: "Торговые точки" },
  { href: "/reports", label: "Отчёты" },
  { href: "/import", label: "Импорт" },
  { href: "/settings", label: "Настройки" },
];

function NavLink({ href, label }: NavItem) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function Sidebar({ user }: { user: AuthUser | null }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          LeetPlus
        </p>
        <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Ассортимент
        </p>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {navItems
          .filter((item) => canAccessPath(user, item.href))
          .map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
      </nav>
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        {user ? (
          <div className="space-y-3">
            <div>
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {user.fullName ?? user.email}
              </p>
              <p className="truncate text-xs text-zinc-500">
                {user.tenantSlug}.leetplus.ru
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Выйти
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              Сейчас открыт demo tenant.
            </p>
            <Link
              href="/login"
              className="block rounded-md bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Войти
            </Link>
            <Link
              href="/register"
              className="block rounded-md border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Регистрация
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
