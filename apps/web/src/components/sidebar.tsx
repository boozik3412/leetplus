"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import type { AuthUser } from "@/lib/auth";
import { getDefaultLandingPath, isShiftWorkspaceRole } from "@/lib/landing";
import { canAccessPath } from "@/lib/permissions";
import { getRoleLabel } from "@/lib/roles";
import { ThemeSwitcher } from "@/components/theme-switcher";

type NavItem = {
  href: string;
  label: string;
  onNavigate?: () => void;
};

type NavGroup = {
  title: string;
  icon:
    | "guests"
    | "communications"
    | "staff"
    | "marketing"
    | "assortment"
    | "management"
    | "administration";
  items: NavItem[];
};

type ProductArea = "Главная" | NavGroup["title"];

type OpenNavGroupsState = {
  pathname: string;
  groups: Record<string, boolean>;
};

const navGroups: NavGroup[] = [
  {
    title: "Гости",
    icon: "guests",
    items: [
      { href: "/guests", label: "Дашборд гостей" },
      { href: "/guests#guest-list", label: "Список гостей" },
      { href: "/guests/report", label: "Полный отчет" },
      { href: "/guests/report#audiences", label: "Группы" },
      { href: "/guests/gamification", label: "Геймификация" },
      { href: "/guests/crm", label: "CRM" },
      { href: "/guests/crm/tasks", label: "Задачи CRM" },
    ],
  },
  {
    title: "Коммуникации",
    icon: "communications",
    items: [
      { href: "/communications", label: "Обзор коммуникаций" },
      { href: "/staff/team-chat", label: "Командный чат" },
      { href: "/staff/notifications", label: "Уведомления" },
      { href: "/guests/crm/tasks", label: "CRM-задачи контакта" },
    ],
  },
  {
    title: "Персонал",
    icon: "staff",
    items: [
      { href: "/staff", label: "Обзор персонала" },
      { href: "/staff/operations-dashboard", label: "Операционная дисциплина" },
      { href: "/staff/tasks", label: "Задачи и правила" },
      { href: "/staff/shift-regulations", label: "Регламенты и чек-листы" },
      { href: "/staff/training-courses", label: "Обучение и аттестации" },
      { href: "/staff/knowledge-base", label: "База знаний" },
      { href: "/staff/administrator-ratings", label: "Контроль и мотивация" },
      { href: "/staff/directory", label: "Сотрудники" },
      { href: "/guests/staff-control", label: "Смены и администраторы" },
    ],
  },
  {
    title: "Маркетинг",
    icon: "marketing",
    items: [
      { href: "/marketing", label: "План кампании" },
      { href: "/marketing#goals", label: "Цели" },
      { href: "/marketing#mechanics", label: "Механики" },
      { href: "/marketing/promo-bundles", label: "Промо-наборы" },
      { href: "/marketing/missions", label: "Промо-сценарии" },
      { href: "/marketing#campaigns", label: "Кампании" },
      { href: "/guests/report#audiences", label: "Группы гостей" },
      { href: "/guests/crm/tasks", label: "Задачи контакта" },
    ],
  },
  {
    title: "Ассортимент",
    icon: "assortment",
    items: [
      { href: "/assortment/dashboard", label: "Дашборд ассортимента" },
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
      { href: "/commercial/audit", label: "Коммерческий аудит" },
      { href: "/commercial/demo", label: "Демо-режим" },
      { href: "/commercial/tariffs", label: "Тарифы" },
      { href: "/users", label: "Пользователи и роли" },
      { href: "/sync", label: "Синхронизация" },
      { href: "/settings", label: "Настройки" },
    ],
  },
  {
    title: "Администрирование",
    icon: "administration",
    items: [
      { href: "/administration", label: "Обзор платформы" },
      { href: "/administration#diagnostics", label: "Диагностика" },
      { href: "/administration#tenants", label: "Сети tenant" },
      { href: "/administration#sync-jobs", label: "Синхронизации" },
      { href: "/administration#audit", label: "Audit trail" },
    ],
  },
];

const shiftWorkspaceNavHrefs = new Set([
  "/staff/tasks",
  "/staff/shift-regulations",
  "/staff/training-courses",
  "/staff/knowledge-base",
  "/staff/team-chat",
]);

const compactSidebarIconClassName = "h-5 w-5 shrink-0";

function canShowNavItem(user: AuthUser | null, item: NavItem) {
  if (!canAccessPath(user, item.href)) {
    return false;
  }

  if (!user || !isShiftWorkspaceRole(user.role)) {
    return true;
  }

  const hrefPath = normalizeNavigationPath(item.href);

  if (hrefPath.startsWith("/staff") || hrefPath.startsWith("/guests/staff-control")) {
    return shiftWorkspaceNavHrefs.has(hrefPath);
  }

  return true;
}

function NavLink({ href, label, onNavigate }: NavItem) {
  const pathname = usePathname();
  const isActive = isNavigationItemActive(pathname, href);

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
  onOpen,
  onClose,
  onNavigate,
}: {
  group: NavGroup;
  isActive: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [popoverPlacement, setPopoverPlacement] = useState({
    top: 0,
    arrowTop: 24,
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePopoverPlacement() {
      const container = containerRef.current;
      const menu = menuRef.current;

      if (!container || !menu) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const menuHeight = menu.offsetHeight;
      const viewportMargin = 8;
      const centeredTop =
        containerRect.top + containerRect.height / 2 - menuHeight / 2;
      const maxTop = Math.max(
        viewportMargin,
        window.innerHeight - menuHeight - viewportMargin,
      );
      const viewportTop = Math.min(
        Math.max(centeredTop, viewportMargin),
        maxTop,
      );
      const top = viewportTop - containerRect.top;
      const arrowTop = Math.min(
        Math.max(containerRect.height / 2 - top, 16),
        Math.max(16, menuHeight - 16),
      );

      setPopoverPlacement({ top, arrowTop });
    }

    const frame = window.requestAnimationFrame(updatePopoverPlacement);
    window.addEventListener("resize", updatePopoverPlacement);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePopoverPlacement);
    };
  }, [group.items.length, isOpen]);

  if (group.items.length === 1) {
    return (
      <Link
        href={group.items[0].href}
        title={group.title}
        aria-label={group.title}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={compactGroupButtonClass({ isActive })}
      >
        <SectionIcon icon={group.icon} />
      </Link>
    );
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    onClose();
  }

  return (
    <div
      ref={containerRef}
      className="relative w-12 shrink-0"
      onMouseEnter={onOpen}
      onMouseMove={onOpen}
      onMouseLeave={onClose}
      onPointerEnter={onOpen}
      onPointerMove={onOpen}
      onPointerLeave={onClose}
      onFocus={onOpen}
      onBlur={handleBlur}
    >
      <button
        type="button"
        title={group.title}
        aria-label={group.title}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-current={isActive ? "page" : undefined}
        onClick={onOpen}
        className={compactGroupButtonClass({ isActive, isOpen })}
      >
        <SectionIcon icon={group.icon} />
        <span className="sr-only">{group.title}</span>
      </button>
      {isOpen ? (
        <div
          ref={menuRef}
          style={{ top: popoverPlacement.top }}
          className="absolute left-full z-[80] ml-1 w-72 overflow-visible"
        >
          <span
            aria-hidden="true"
            className="absolute -left-1 top-0 h-full w-1"
          />
          <span
            style={{ top: popoverPlacement.arrowTop }}
            className="absolute -left-2 z-10 h-4 w-4 -translate-y-1/2 rotate-45 border-b border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
          <div className="max-h-[calc(100vh-1rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl shadow-zinc-950/15 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/50">
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
        </div>
      ) : null}
    </div>
  );
}

function compactGroupButtonClass({
  isActive,
  isOpen = false,
}: {
  isActive: boolean;
  isOpen?: boolean;
}) {
  return [
    "group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-zinc-500 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
    isActive
      ? "border-emerald-500/50 bg-emerald-500 text-zinc-950 shadow-sm"
      : isOpen
        ? "border-zinc-300 bg-zinc-100 text-zinc-950 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
  ].join(" ");
}

function SectionIcon({ icon }: { icon: NavGroup["icon"] }) {
  const common = {
    className: compactSidebarIconClassName,
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
        <path d="M7 19v-1.2a4.2 4.2 0 0 1 8.4 0V19" />
        <circle cx="11.2" cy="8" r="3.2" />
        <path d="M16.8 10.5a2.4 2.4 0 1 0-1.5-4.2" />
        <path d="M18 19v-.6a3.2 3.2 0 0 0-2.3-3.1" />
      </svg>
    );
  }

  if (icon === "staff") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="M8 5V3" />
        <path d="M16 5V3" />
        <circle cx="12" cy="11" r="2.2" />
        <path d="M8.8 16a3.4 3.4 0 0 1 6.4 0" />
      </svg>
    );
  }

  if (icon === "communications") {
    return (
      <svg {...common}>
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H12l-4 3v-3.2A3.5 3.5 0 0 1 5 11.5z" />
        <path d="M9 8h6" />
        <path d="M9 11h4" />
        <path d="M18.5 11.5A3.5 3.5 0 0 1 21 15v4l-3-2h-4" />
      </svg>
    );
  }

  if (icon === "management") {
    return (
      <svg {...common}>
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
        <circle cx="9" cy="7" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="11" cy="17" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (icon === "administration") {
    return (
      <svg {...common}>
        <path d="M12 3 19 6v5c0 4.8-2.9 8.2-7 10-4.1-1.8-7-5.2-7-10V6z" />
        <path d="M9 12h6" />
        <path d="M12 9v6" />
      </svg>
    );
  }

  if (icon === "marketing") {
    return (
      <svg {...common}>
        <path d="M5 13.5h3.5l7-4.5v10l-7-4.5H5z" />
        <path d="M8.5 14.5l1.2 4.5" />
        <path d="M18.5 9.8a4.2 4.2 0 0 1 0 8.4" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
      <path d="M8 5v14" />
      <path d="M16 5v9" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      className={compactSidebarIconClassName}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

function LogoLink({
  href = "/dashboard",
  onNavigate,
}: {
  href?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-label="Перейти на главную"
      onClick={onNavigate}
      className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
    >
      <LogoMark />
    </Link>
  );
}

function LogoMark() {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-sm font-semibold text-white transition group-hover:bg-zinc-900 dark:bg-emerald-400 dark:text-zinc-950 dark:group-hover:bg-emerald-300">
      LP
    </span>
  );
}

function CompactHomeLink({
  href = "/dashboard",
  isActive,
  title = "Главная: сводный дашборд сети",
  onNavigate,
}: {
  href?: string;
  isActive: boolean;
  title?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={title}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      onFocus={onNavigate}
      onMouseEnter={onNavigate}
      onPointerEnter={onNavigate}
      className={compactGroupButtonClass({ isActive })}
    >
      <HomeIcon />
    </Link>
  );
}

function normalizeNavigationPath(pathname: string) {
  const [pathWithoutQuery] = pathname.split("?");
  const [pathWithoutHash] = pathWithoutQuery.split("#");

  if (pathWithoutHash !== "/" && pathWithoutHash.endsWith("/")) {
    return pathWithoutHash.slice(0, -1);
  }

  return pathWithoutHash;
}

function isDashboardPath(pathname: string) {
  const currentPathname = normalizeNavigationPath(pathname);

  return (
    currentPathname === "/" ||
    currentPathname === "/dashboard" ||
    currentPathname.startsWith("/dashboard/")
  );
}

function isNavigationItemActive(pathname: string, href: string) {
  if (href.includes("#")) {
    return false;
  }

  const currentPathname = normalizeNavigationPath(pathname);
  const hrefPath = normalizeNavigationPath(href);

  if (hrefPath === "/dashboard") {
    return isDashboardPath(currentPathname);
  }

  if (hrefPath === "/staff/shift-workspace") {
    return currentPathname === hrefPath;
  }

  return currentPathname === hrefPath;
}

function resolveCurrentProductArea(pathname: string): ProductArea {
  const currentPathname = normalizeNavigationPath(pathname);

  if (isDashboardPath(currentPathname)) {
    return "Главная";
  }

  if (
    currentPathname.startsWith("/communications") ||
    currentPathname.startsWith("/staff/team-chat") ||
    currentPathname.startsWith("/staff/notifications")
  ) {
    return "Коммуникации";
  }

  if (
    currentPathname.startsWith("/staff") ||
    currentPathname.startsWith("/guests/staff-control")
  ) {
    return "Персонал";
  }

  if (
    currentPathname.startsWith("/administration") ||
    currentPathname.startsWith("/admin")
  ) {
    return "Администрирование";
  }

  if (currentPathname.startsWith("/marketing")) {
    return "Маркетинг";
  }

  if (currentPathname.startsWith("/guests")) {
    return "Гости";
  }

  if (
    currentPathname.startsWith("/commercial") ||
    currentPathname.startsWith("/users") ||
    currentPathname.startsWith("/sync") ||
    currentPathname.startsWith("/settings")
  ) {
    return "Управление";
  }

  if (
    currentPathname.startsWith("/assortment") ||
    currentPathname.startsWith("/products") ||
    currentPathname.startsWith("/categories") ||
    currentPathname.startsWith("/suppliers") ||
    currentPathname.startsWith("/stores") ||
    currentPathname.startsWith("/reports") ||
    currentPathname.startsWith("/import") ||
    currentPathname.startsWith("/utilities")
  ) {
    return "Ассортимент";
  }

  return "Главная";
}

export function Sidebar({ user }: { user: AuthUser | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const desktopSidebarRef = useRef<HTMLElement | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openNavState, setOpenNavState] = useState<OpenNavGroupsState>({
    pathname: "",
    groups: {},
  });
  const openNavGroups =
    openNavState.pathname === pathname ? openNavState.groups : {};
  const allowedNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canShowNavItem(user, item)),
    }))
    .filter((group) => group.items.length > 0);
  const showHomeLink = Boolean(user);
  const homeHref = user ? getDefaultLandingPath(user) : "/dashboard";
  const homeLabel = homeHref === "/dashboard" ? "Главная" : "Моя смена";
  const homeTitle =
    homeHref === "/dashboard"
      ? "Главная: сводный дашборд сети"
      : "Моя смена: задачи, регламенты и текущая выручка";
  const isHomeActive = isNavigationItemActive(pathname, homeHref);
  const isDashboardArea = isDashboardPath(pathname);
  const currentProductArea = resolveCurrentProductArea(pathname);
  const hasOpenNavGroup = Object.values(openNavGroups).some(Boolean);

  useEffect(() => {
    if (!isDashboardArea || !searchParams.has("skuGrouping")) {
      return;
    }

    const canonicalParams = new URLSearchParams(searchParams.toString());

    canonicalParams.delete("skuGrouping");

    const query = canonicalParams.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [isDashboardArea, pathname, router, searchParams]);

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

      setOpenNavState({ pathname, groups: {} });
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenNavState({ pathname, groups: {} });
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
  }, [hasOpenNavGroup, pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    router.push("/login");
    router.refresh();
  }

  function toggleNavGroup(title: string) {
    setOpenNavState((current) => {
      const currentGroups =
        current.pathname === pathname ? current.groups : {};

      return {
        pathname,
        groups: {
          [title]: !currentGroups[title],
        },
      };
    });
  }

  function openNavGroup(title: string) {
    setOpenNavState({
      pathname,
      groups: { [title]: true },
    });
  }

  function closeNavGroups() {
    setOpenNavState({
      pathname,
      groups: {},
    });
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90 md:hidden">
        <div className="flex items-center gap-3">
          <LogoLink href={homeHref} />
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
                  <LogoLink
                    href={homeHref}
                    onNavigate={() => setIsMobileMenuOpen(false)}
                  />
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
              {showHomeLink ? (
                <NavLink
                  href={homeHref}
                  label={homeLabel}
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
              ) : null}
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
        className="sticky top-0 z-[70] hidden h-dvh max-h-dvh w-20 shrink-0 flex-col border-r border-zinc-200/80 bg-white/80 shadow-[inset_-1px_0_0_rgb(255_255_255_/_0.5)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/75 md:flex"
      >
        <Link
          href={homeHref}
          title={homeTitle}
          aria-label={homeTitle}
          onClick={closeNavGroups}
          onFocus={closeNavGroups}
          onMouseEnter={closeNavGroups}
          onPointerEnter={closeNavGroups}
          className="group flex border-b border-zinc-200/80 px-3 py-4 transition-colors hover:bg-zinc-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/70 dark:border-zinc-800 dark:hover:bg-zinc-900/70"
        >
          <LogoMark />
        </Link>
        <nav className="min-h-0 flex-1 space-y-2 overflow-visible px-3 py-4">
          {showHomeLink ? (
            <>
              <CompactHomeLink
                href={homeHref}
                isActive={isHomeActive}
                title={homeTitle}
                onNavigate={closeNavGroups}
              />
              {allowedNavGroups.length > 0 ? (
                <div
                  aria-hidden="true"
                  className="mx-auto h-px w-10 bg-zinc-200/80 dark:bg-zinc-800/80"
                />
              ) : null}
            </>
          ) : null}
          {allowedNavGroups.map((group) => (
            <CompactNavSection
              key={group.title}
              group={group}
              isActive={!isHomeActive && currentProductArea === group.title}
              isOpen={Boolean(openNavGroups[group.title])}
              onOpen={() => openNavGroup(group.title)}
              onClose={closeNavGroups}
              onNavigate={closeNavGroups}
            />
          ))}
        </nav>
        <div className="shrink-0 space-y-3 border-t border-zinc-200/80 p-3 dark:border-zinc-800">
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
            {user.tenantSlug}.leetplus.ru · {getRoleLabel(user.role)}
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
            className={compactSidebarIconClassName}
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
        className={compactSidebarIconClassName}
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
