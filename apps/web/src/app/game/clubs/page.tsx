import { loadClubDirectory } from "../../play/load-club-directory";
import { GameClubSelectClient } from "./game-club-select-client";

export const dynamic = "force-dynamic";

type GameClubSelectPageProps = {
  searchParams: Promise<{
    telegramChallenge?: string | string[];
    telegramTenant?: string | string[];
    telegramStore?: string | string[];
  }>;
};

function searchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function GameClubSelectPage({
  searchParams,
}: GameClubSelectPageProps) {
  const { directory, loadError } = await loadClubDirectory();
  const params = await searchParams;
  const telegramChallenge = searchParam(params.telegramChallenge);
  const telegramTenant = searchParam(params.telegramTenant);
  const telegramStore = searchParam(params.telegramStore);

  return (
    <GameClubSelectClient
      initialDirectory={directory}
      loadError={loadError}
      telegramHandoff={
        telegramChallenge && telegramTenant && telegramStore
          ? { challengeId: telegramChallenge, tenantSlug: telegramTenant, storeId: telegramStore }
          : null
      }
    />
  );
}
