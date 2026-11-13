"use client";

import { useRouter } from "next/navigation";
import { GuestGroupBuilder } from "@/components/guest-group-builder";

/** Where to go after a group is saved on /guests/groups/new. */
export function returnWithAudience(
  returnTo: string | null,
  audienceId: string,
) {
  if (!returnTo) {
    return `/guests?tab=groups&created=${encodeURIComponent(audienceId)}`;
  }
  const [path, hash = ""] = returnTo.split("#");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}audience=${encodeURIComponent(audienceId)}${
    hash ? `#${hash}` : ""
  }`;
}

export function NewGuestGroupFlow({
  stores,
  defaultStoreId,
  returnTo,
}: {
  stores: Array<{ id: string; name: string }>;
  defaultStoreId: string;
  returnTo: string | null;
}) {
  const router = useRouter();

  return (
    <GuestGroupBuilder
      stores={stores}
      defaultStoreId={defaultStoreId}
      cancelLabel={returnTo ? "Назад" : "К группам"}
      onCancel={() => router.push(returnTo ?? "/guests?tab=groups")}
      onCreated={(audience) => {
        router.push(returnWithAudience(returnTo, audience.id));
        router.refresh();
      }}
    />
  );
}
