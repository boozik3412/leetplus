import { Sidebar } from "@/components/sidebar";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row md:min-h-0">
      <Sidebar user={user} />
      <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-zinc-50 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100">
        {children}
      </div>
    </div>
  );
}
