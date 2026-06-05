import { Sidebar } from "@/components/sidebar";
import { getCurrentUserForRequest } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUserForRequest();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--background)] md:min-h-0 md:flex-row">
      <Sidebar user={user} />
      <div className="min-h-0 min-w-0 flex-1 overflow-auto text-zinc-950 dark:text-zinc-100">
        {children}
      </div>
    </div>
  );
}
