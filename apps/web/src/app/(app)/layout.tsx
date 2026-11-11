import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { getCurrentUserForRequest } from "@/lib/auth";
import {
  sidebarCollapsedCookie,
  sidebarCollapsedValue,
} from "@/lib/sidebar-preference";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, cookieStore] = await Promise.all([
    getCurrentUserForRequest(),
    cookies(),
  ]);
  const sidebarCollapsed =
    cookieStore.get(sidebarCollapsedCookie)?.value === sidebarCollapsedValue;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--background)] md:flex-row">
      <Sidebar user={user} initialCollapsed={sidebarCollapsed} />
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-scroll [scrollbar-gutter:stable] text-zinc-950 dark:text-zinc-100">
        {children}
      </div>
    </div>
  );
}
