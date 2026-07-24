import {
  loadClubDirectory,
  searchParam,
} from "../../play/load-club-directory";
import { PlayRegistrationClient } from "../../play/play-registration-client";

export const dynamic = "force-dynamic";

type GameAuthPageProps = {
  searchParams: Promise<{
    club?: string | string[];
    clubId?: string | string[];
    ref?: string | string[];
    storeId?: string | string[];
  }>;
};

export default async function GameAuthPage({ searchParams }: GameAuthPageProps) {
  const params = await searchParams;
  const { directory, loadError } = await loadClubDirectory();
  const authDirectory = {
    ...directory,
    verification: {
      ...directory.verification,
      recommendedChannel: "TELEGRAM_BOT" as const,
      options: directory.verification.options.filter(
        (option) =>
          option.channel === "TELEGRAM_BOT" || option.channel === "USER_CALL",
      ),
    },
    clubs: directory.clubs.map((club) => ({
      ...club,
      tenant: {
        ...club.tenant,
        gameLogoUrl: null,
      },
      store: {
        ...club.store,
        gameLogoUrl: null,
      },
    })),
  };

  return (
    <PlayRegistrationClient
      initialClubId={searchParam(params.clubId) ?? searchParam(params.club)}
      initialDirectory={authDirectory}
      initialReferralCode={searchParam(params.ref)}
      initialStoreId={searchParam(params.storeId)}
      loadError={loadError}
      surface="game-auth"
    />
  );
}
