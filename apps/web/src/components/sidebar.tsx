"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { AuthUser } from "@/lib/auth";
import { canAccessPath } from "@/lib/permissions";
import { ThemeSwitcher } from "@/components/theme-switcher";

type NavItem = {
  href: string;
  label: string;
  onNavigate?: () => void;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: "Гости",
    items: [{ href: "/guests", label: "Гости" }],
  },
  {
    title: "Ассортимент",
    items: [
      { href: "/admin", label: "Админ платформы" },
      { href: "/dashboard", label: "Дашборд" },
      { href: "/products", label: "Товары" },
      { href: "/categories", label: "Категории" },
      { href: "/suppliers", label: "Поставщики" },
      { href: "/stores", label: "Торговые точки" },
      { href: "/reports", label: "Отчёты" },
      { href: "/import", label: "Импорт" },
      { href: "/utilities", label: "Утилиты" },
      { href: "/settings", label: "Настройки" },
    ],
  },
];

function NavLink({ href, label, onNavigate }: NavItem) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-zinc-950 text-white shadow-sm dark:bg-emerald-400 dark:text-zinc-950"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function NavSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 first:pt-0">
        {title}
      </p>
      {children}
    </div>
  );
}

export function Sidebar({ user }: { user: AuthUser | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const allowedNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessPath(user, item.href)),
    }))
    .filter((group) => group.items.length > 0);
  const currentProductArea = pathname.startsWith("/guests")
    ? "Гости"
    : "Ассортимент";

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white dark:bg-emerald-400 dark:text-zinc-950">
            LP
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
              LeetPlus
            </p>
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {currentProductArea}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Открыть меню"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-900 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <span className="grid gap-1.5">
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
            <span className="block h-0.5 w-5 rounded-full bg-current" />
          </span>
        </button>
      </div>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
          />
          <div className="relative flex h-full w-[min(20rem,calc(100vw-2rem))] flex-col border-r border-zinc-200/80 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white dark:bg-emerald-400 dark:text-zinc-950">
                    LP
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
                      LeetPlus
                    </p>
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {currentProductArea}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Закрыть меню"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 text-xl leading-none text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  ×
                </button>
              </div>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {allowedNavGroups.map((group) => (
                <NavSection key={group.title} title={group.title}>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      {...item}
                      onNavigate={() => setIsMobileMenuOpen(false)}
                    />
                  ))}
                </NavSection>
              ))}
            </nav>
            <div className="border-t border-zinc-200/80 p-3 dark:border-zinc-800">
              <UserPanel user={user} onLogout={handleLogout} />
            </div>
          </div>
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200/80 bg-white/75 shadow-[inset_-1px_0_0_rgb(255_255_255_/_0.5)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/70 md:flex">
        <div className="border-b border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white dark:bg-emerald-400 dark:text-zinc-950">
              LP
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
                LeetPlus
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {currentProductArea}
              </p>
            </div>
            <ThemeSwitcher variant="compact" />
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {allowedNavGroups.map((group) => (
            <NavSection key={group.title} title={group.title}>
              {group.items.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </NavSection>
          ))}
        </nav>
        <div className="border-t border-zinc-200/80 p-3 dark:border-zinc-800">
          <UserPanel user={user} onLogout={handleLogout} />
        </div>
      </aside>
    </>
  );
}

function UserPanel({
  user,
  onLogout,
}: {
  user: AuthUser | null;
  onLogout: () => void;
}) {
  if (user) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {user.fullName ?? user.email}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {user.tenantSlug}.leetplus.ru · {user.role}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Выйти
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">Сейчас открыт demo tenant.</p>
      <Link
        href="/login"
        className="block rounded-xl bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        Войти
      </Link>
      <Link
        href="/register"
        className="block rounded-xl border border-zinc-200 bg-white px-3 py-2 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        Регистрация
      </Link>
    </div>
  );
}
