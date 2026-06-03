import { GuestPortalClient } from "./portal";

type PageProps = {
  params: Promise<{
    tenantSlug: string;
    storeId: string;
  }>;
};

export default async function GuestPortalPage({ params }: PageProps) {
  const { tenantSlug, storeId } = await params;

  return <GuestPortalClient tenantSlug={tenantSlug} storeId={storeId} />;
}
