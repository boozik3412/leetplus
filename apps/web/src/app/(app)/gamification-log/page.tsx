import { permanentRedirect } from "next/navigation";

export default function LegacyGamificationLogPage() {
  permanentRedirect("/gamification/log");
}
