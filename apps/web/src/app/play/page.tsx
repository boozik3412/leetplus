import { getApiUrl, readApiError } from "@/lib/api";
import type { GuestPortalGamificationClubDirectory } from "@/lib/guest-portal";
import { PlayRegistrationClient } from "./play-registration-client";

export const dynamic = "force-dynamic";

const emptyDirectory: GuestPortalGamificationClubDirectory = {
  updatedAt: new Date(0).toISOString(),
  total: 0,
  cities: [],
  search: {
    locationReady: false,
    radiusKm: null,
    radiusApplied: false,
    totalBeforeRadius: 0,
    hiddenWithoutCoordinates: 0,
  },
  clubs: [],
};

export default async function PlayPage() {
  const { directory, loadError } = await loadClubDirectory();

  return (
    <PlayRegistrationClient
      initialDirectory={directory}
      loadError={loadError}
    />
  );
}

async function loadClubDirectory(): Promise<{
  directory: GuestPortalGamificationClubDirectory;
  loadError: string | null;
}> {
  try {
    const response = await fetch(
      `${getApiUrl()}/guest-portal/gamification/clubs`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return {
        directory: emptyDirectory,
        loadError: await readApiError(response),
      };
    }

    return {
      directory:
        (await response.json()) as GuestPortalGamificationClubDirectory,
      loadError: null,
    };
  } catch (error) {
    return {
      directory: emptyDirectory,
      loadError:
        error instanceof Error
          ? error.message
          : "Не удалось загрузить клубы геймификации.",
    };
  }
}
