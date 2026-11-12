import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LandingPage } from "@/components/landing/landing-page";
import { getCurrentUser } from "@/lib/auth";
import { GUEST_AUTH_COOKIE_NAME } from "@/lib/guest-portal";
import { getDefaultLandingPath } from "@/lib/landing";

const title = "LeetPlus — игровой модуль и аналитика для компьютерных клубов";
const description =
  "Кейсы, задания, боевой пропуск и рейтинг для гостей вашего клуба на Langame. Эффект в цифрах, аналитика бара и персонала для владельца сети.";

export const metadata: Metadata = {
  metadataBase: new URL("https://leetplus.ru"),
  title,
  description,
  alternates: { canonical: "/" },
  // Link preview in Telegram and other messengers where owners share the site.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "LeetPlus",
    locale: "ru_RU",
    title: "LeetPlus — клуб, в который хочется вернуться",
    description:
      "Кейсы, задания и боевой пропуск для гостей клуба на Langame. Игровой модуль 2 месяца бесплатно.",
    images: [{ url: "/landing/og.jpg", width: 1200, height: 630, alt: "LeetPlus: игровой модуль для компьютерных клубов" }],
  },
  twitter: { card: "summary_large_image" },
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
