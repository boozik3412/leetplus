import { clubFloorPlanSwitcher } from "@/lib/club-floor-plan-templates";
import { proxyJsonRequest } from "@/lib/proxy";

// Clubs with a drawn hall, for the club cards of the full-screen scene.
export async function GET(request: Request) {
  return proxyJsonRequest(request, "/stores/floor-plans", "GET", {
    forwardQuery: false,
    privateNoStore: true,
    transform: clubFloorPlanSwitcher,
  });
}
