// Records on the guest profile that the tutorial was finished or skipped, so
// it is not shown again on another device. Public guest contour only.
export async function markGameTutorialSeen(version: number): Promise<void> {
  const response = await fetch("/api/guest-portal/session/tutorial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Tutorial state was not saved (${response.status}).`);
  }
}
