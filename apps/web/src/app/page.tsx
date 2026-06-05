import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultLandingPath } from "@/lib/landing";

export default async function Home() {
  const user = await getCurrentUser();

  redirect(getDefaultLandingPath(user));
}
