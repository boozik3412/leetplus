import { ModuleChoicePage } from "@/components/module-choice-page";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultLandingPath } from "@/lib/landing";

export default async function StartPage() {
  const user = await getCurrentUser();
  const analyticsHref = user ? getDefaultLandingPath(user) : "/login";

  return <ModuleChoicePage analyticsHref={analyticsHref} />;
}
