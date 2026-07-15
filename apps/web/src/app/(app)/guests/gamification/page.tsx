import { permanentRedirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LegacyGuestGamificationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }

  const search = query.toString();

  permanentRedirect(search ? `/gamification?${search}` : "/gamification");
}
