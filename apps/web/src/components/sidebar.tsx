"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  icon: "guests" | "staff" | "assortment" | "management";
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: "Гости",
    icon: "guests",
    items: [
      { href: "/guests", label: "Дашборд гостей" },
      { href: "/guests#guest-list", label: "Гости" },
    ],
  },
  {
    title: "Персонал",
    icon: "staff",
    items: [
      { href: "/guests/staff-control", label: "Контроль персонала" },
      { href: "/guests/staff-control/operators", label: "Администраторы" },
    ],
  },
  {
    title: "Ассортимент",
    icon: "assortment",
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
    ],
  },
  {
    title: "Управление",
    icon: "management",
    items: [
      { href: "/sync", label: "Синхронизация" },
      { href: "/settings", label: "Настройки" },
    ],
  },
];

function NavLink({ href, label, onNavigate }: NavItem) {
  const pathname = usePathname();
  const hrefPath = href.split("#")[0];
  const isActive = pathname === hrefPath && !href.includes("#");

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
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
      >
        <span>{title}</span>
        <span
          aria-hidden="true"
          className={[
            "text-sm leading-none text-zinc-400 transition-transform duration-200 ease-out",
            isOpen ? "rotate-90" : "",
          ].join(" ")}
        >
          &gt;
        </span>
      </button>
      <div
        className={[
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-1 pl-2 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function CompactNavSection({
  group,
  isActive,
  isOpen,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  if (group.items.length === 1) {
    return (
      <Link
        href={group.items[0].href}
        title={group.title}
        aria-label={group.title}
        onClick={onNavigate}
        className={compactGroupButtonClass(isActive)}
      >
        <SectionIcon icon={group.icon} />
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        title={group.title}
        aria-label={group.title}
        aria-expanded={isOpen}
        onClick={onToggle}
        className={compactGroupButtonClass(isActive || isOpen)}
      >
        <SectionIcon icon={group.icon} />
      </button>
      {isOpen ? (
        <div className="absolute left-full top-0 z-50 ml-3 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl shadow-zinc-950/10 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40">
          <div className="px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {group.title}
            </p>
          </div>
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavLink key={item.href} {...item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function compactGroupButtonClass(isActive: boolean) {
  return [
    "flex h-12 w-12 items-center justify-center rounded-2xl border text-zinc-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
    isActive
      ? "border-emerald-500/50 bg-emerald-500 text-zinc-950 shadow-sm"
      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
  ].join(" ");
}

function SectionIcon({ icon }: { icon: NavGroup["icon"] }) {
  const common = {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (icon === "guests") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }

  if (icon === "staff") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
        <circle cx="12" cy="7" r="4" />
        <path d="M20 8v6" />
        <path d="M23 11h-6" />
      </svg>
    );
  }

  if (icon === "management") {
    return (
      <svg {...common}>
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6V20a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1H4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1H20a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-.6 1Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 19h16" />
      <path d="M6 17V9" />
      <path d="M12 17V5" />
      <path d="M18 17v-6" />
    </svg>
  );
}

function LogoLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      aria-label="Перейти на главную"
      onClick={onNavigate}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:bg-emerald-400 dark:text-zinc-950"
    >
      LP
    </Link>
  );
}

export function Sidebar({ user }: { user: AuthUser | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const desktopSidebarRef = useRef<HTMLElement | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openNavGroups, setOpenNavGroups] = useState<Record<string, boolean>>(
    {},
  );
  const allowedNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessPath(user, item.href)),
    }))
    .filter((group) => group.items.length > 0);
  const currentProductArea = pathname.startsWith("/guests/staff-control")
    ? "Персонал"
    : pathname.startsWith("/guests")
    ? "Гости"
    : pathname.startsWith("/sync") || pathname.startsWith("/settings")
      ? "Управление"
      : "Ассортимент";
  const hasOpenNavGroup = Object.values(openNavGroups).some(Boolean);

  useEffect(() => {
    if (!hasOpenNavGroup) {
      return;
    }

    function closeOnOutsideClick(event: MouseEvent | TouchEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (desktopSidebarRef.current?.contains(target)) {
        return;
      }

      setOpenNavGroups({});
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenNavGroups({});
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [hasOpenNavGroup]);

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    router.push("/login");
    router.refresh();
  }

  function toggleNavGroup(title: string) {
    setOpenNavGroups((current) => ({
      [title]: !current[title],
    }));
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90 md:hidden">
        <div className="flex items-center gap-3">
          <LogoLink />
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
                  <LogoLink onNavigate={() => setIsMobileMenuOpen(false)} />
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
                <NavSection
                  key={group.title}
                  title={group.title}
                  isOpen={Boolean(openNavGroups[group.title])}
                  onToggle={() => toggleNavGroup(group.title)}
                >
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

      <aside
        ref={desktopSidebarRef}
        className="relative hidden w-20 shrink-0 flex-col border-r border-zinc-200/80 bg-white/80 shadow-[inset_-1px_0_0_rgb(255_255_255_/_0.5)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/75 md:flex"
      >
        <div className="flex justify-center border-b border-zinc-200/80 px-3 py-4 dark:border-zinc-800">
          <LogoLink />
        </div>
        <nav className="flex-1 space-y-2 overflow-visible px-3 py-4">
          {allowedNavGroups.map((group) => (
            <CompactNavSection
              key={group.title}
              group={group}
              isActive={currentProductArea === group.title}
              isOpen={Boolean(openNavGroups[group.title])}
              onToggle={() => toggleNavGroup(group.title)}
              onNavigate={() => setOpenNavGroups({})}
            />
          ))}
        </nav>
        <div className="space-y-3 border-t border-zinc-200/80 p-3 dark:border-zinc-800">
          <ThemeSwitcher variant="compact" />
          <CompactUserPanel user={user} onLogout={handleLogout} />
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

function CompactUserPanel({
  user,
  onLogout,
}: {
  user: AuthUser | null;
  onLogout: () => void;
}) {
  if (user) {
    const initials = (user.fullName ?? user.email ?? "LP")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");

    return (
      <div className="space-y-2">
        <div
          title={user.fullName ?? user.email}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
        >
          {initials || "LP"}
        </div>
        <button
          type="button"
          title="Выйти"
          aria-label="Выйти"
          onClick={onLogout}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      title="Войти"
      aria-label="Войти"
      className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <path d="m10 17 5-5-5-5" />
        <path d="M15 12H3" />
      </svg>
    </Link>
  );
}
