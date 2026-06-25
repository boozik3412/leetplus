import Script from "next/script";
import { TelegramMiniAppClient } from "./telegram-mini-app-client";

export const dynamic = "force-dynamic";

export default function GameMiniAppPage() {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
      />
      <TelegramMiniAppClient />
    </>
  );
}
