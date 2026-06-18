import { loadClubDirectory } from "../../play/load-club-directory";
import { GameClubSelectClient } from "./game-club-select-client";

export const dynamic = "force-dynamic";

export default async function GameClubSelectPage() {
  const { directory, loadError } = await loadClubDirectory();

  return (
    <GameClubSelectClient
      initialDirectory={directory}
      loadError={loadError}
    />
  );
}
