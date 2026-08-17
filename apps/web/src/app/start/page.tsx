import { ModuleChoicePage } from "@/components/module-choice-page";
import { getCurrentUser } from "@/lib/auth";
import { getGuestHomepageContext } from "@/lib/guest-homepage";
import { getDefaultLandingPath } from "@/lib/landing";

export default async function StartPage() {
  const [user, gameContext] = await Promise.all([
    getCurrentUser(),
    getGuestHomepageContext(),
  ]);
  const analyticsHref = user ? getDefaultLandingPath(user) : "/login";

  return (
    <ModuleChoicePage
      analyticsHref={analyticsHref}
      gameContext={gameContext}
    />
  );
}
