import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LandingPage } from "@/components/landing/landing-page";
import { getCurrentUser } from "@/lib/auth";
import { GUEST_AUTH_COOKIE_NAME } from "@/lib/guest-portal";
import { getDefaultLandingPath } from "@/lib/landing";

export const metadata: Metadata = {
  title: "LeetPlus — игровой модуль и аналитика для компьютерных клубов",
  description:
    "Кейсы, задания, боевой пропуск и рейтинг для гостей вашего клуба на Langame. Эффект в цифрах, аналитика бара и персонала для владельца сети.",
};

export default async function Home() {
  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);
  const hasGuestSession = Boolean(cookieStore.get(GUEST_AUTH_COOKIE_NAME)?.value);

  return (
    <LandingPage
      cabinetHref={user ? getDefaultLandingPath(user) : "/login"}
      gameHref={hasGuestSession ? "/game" : "/game/auth"}
      gameLabel={hasGuestSession ? "Продолжить" : "Играть"}
    />
  );
}
