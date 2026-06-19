import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    tenantSlug: string;
    storeId: string;
  }>;
};

export default async function GuestPortalPage({ params }: PageProps) {
  const { tenantSlug, storeId } = await params;
  const clubId = `${tenantSlug}:${storeId}`;
  const target = new URLSearchParams({
    clubId,
    storeId,
  });

  redirect(`/game/auth?${target.toString()}`);
}
