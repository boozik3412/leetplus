// Guest game accounts (Steam, FACEIT): types and the Steam OpenID return
// handling of the public guest contour. The API verifies everything; the page
// only forwards what Steam returned.

export type GuestGameAccountsLookupStatus =
  | "PENDING"
  | "FOUND"
  | "NOT_FOUND"
  | "FAILED";

export type GuestGameAccounts = {
  enabled: boolean;
  steam: {
    steamId: string;
    nickname: string | null;
    avatarUrl: string | null;
    profileUrl: string;
    linkedAt: string;
  } | null;
  faceit: {
    status: GuestGameAccountsLookupStatus;
    nickname: string | null;
    level: number | null;
    elo: number | null;
    profileUrl: string | null;
    checkedAt: string | null;
  } | null;
  relinkAvailableAt: string | null;
};

export const GUEST_GAME_ACCOUNTS_PATH = "/api/guest-portal/session/game-accounts";

let enabledRequest: Promise<boolean> | null = null;

/**
 * Whether the network turned game accounts on. Asked once per page load and
 * shared by the menu and the tutorial; a failed request is asked again later.
 */
export function loadGameAccountsEnabled(): Promise<boolean> {
  enabledRequest ??= fetch(GUEST_GAME_ACCOUNTS_PATH, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then(
      (data: unknown) =>
        Boolean(data) &&
        typeof data === "object" &&
        (data as { enabled?: unknown }).enabled === true,
    )
    .catch(() => {
      enabledRequest = null;
      return false;
    });

  return enabledRequest;
}

const OPENID_KEY = /^openid\.[a-z_]{2,32}$/;
const MAX_OPENID_FIELDS = 16;

/**
 * Reads the Steam OpenID answer from the return URL
 * (`/game/accounts?lpState=…&openid.*=…`). Returns null when the page was
 * opened normally.
 */
export function readSteamOpenIdReturn(
  search: string,
): { state: string; openid: Record<string, string> } | null {
  const params = new URLSearchParams(search);
  const state = params.get("lpState");

  if (!state) {
    return null;
  }

  const openid: Record<string, string> = {};
  let count = 0;

  for (const [key, value] of params.entries()) {
    if (!key.startsWith("openid.")) continue;
    if (!OPENID_KEY.test(key) || key in openid) return null;
    openid[key] = value;
    count += 1;
    if (count > MAX_OPENID_FIELDS) return null;
  }

  // Steam returns openid.mode=cancel when the guest declined.
  if (count === 0 || openid["openid.mode"] !== "id_res") {
    return { state, openid: {} };
  }

  return { state, openid };
}

export function faceitStatusText(accounts: GuestGameAccounts) {
  const faceit = accounts.faceit;

  if (!accounts.steam || !faceit) {
    return "Привяжите Steam, и мы найдём ваш FACEIT сами.";
  }

  switch (faceit.status) {
    case "FOUND":
      return faceit.nickname
        ? `Найден: ${faceit.nickname}`
        : "Аккаунт FACEIT найден.";
    case "NOT_FOUND":
      return "К этому Steam не привязан аккаунт FACEIT. Привяжите Steam в настройках FACEIT, и мы найдём его при следующей проверке.";
    case "FAILED":
      return "FACEIT сейчас не ответил. Проверим ещё раз автоматически.";
    default:
      return "Ищем ваш аккаунт FACEIT. Обычно это занимает несколько минут.";
  }
}
