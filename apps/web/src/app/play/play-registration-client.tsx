"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LegalEntityInfo } from "@/components/legal-entity-info";
import type {
  GuestPortalGamificationClub,
  GuestPortalGamificationClubDirectory,
  GuestPortalVerificationChannel,
  GuestPortalGameSummary,
  GuestPortalIncomingCallLast4StartResponse,
  GuestPortalIncomingCallLast4VerifyResponse,
  GuestPortalLangameMatchResponse,
  GuestPortalLocalGameProfileMatch,
  GuestPortalOtpStartResponse,
  GuestPortalOtpVerifyResponse,
  GuestPortalPayload,
  GuestPortalTelegramAuthStartResponse,
  GuestPortalTelegramAuthStatusResponse,
  GuestPortalUserCallAuthStartResponse,
  GuestPortalUserCallAuthStatusResponse,
} from "@/lib/guest-portal";

type PlayRegistrationClientProps = {
  initialDirectory: GuestPortalGamificationClubDirectory;
  initialClubId: string | null;
  initialReferralCode: string | null;
  initialStoreId: string | null;
  loadError: string | null;
  surface?: PlayRegistrationSurface;
};

type PlayRegistrationSurface = "play" | "game-auth";

type PlayLocation = {
  latitude: number;
  longitude: number;
};

type MapViewport = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
};

const RADIUS_OPTIONS = [null, 1, 3, 5, 10, 25] as const;
type RadiusOption = (typeof RADIUS_OPTIONS)[number];
type ActiveSessionState = "loading" | "ready" | "empty" | "error";
type VerificationStatus =
  GuestPortalGamificationClubDirectory["verification"]["options"][number]["status"];
const GAME_AUTH_VERIFICATION_CHANNELS = new Set<GuestPortalVerificationChannel>(
  ["TELEGRAM_BOT", "USER_CALL"],
);
const HIDDEN_PUBLIC_VERIFICATION_CHANNELS =
  new Set<GuestPortalVerificationChannel>(["SMS_CODE"]);

export function PlayRegistrationClient({
  initialDirectory,
  initialClubId,
  initialReferralCode,
  initialStoreId,
  loadError,
  surface = "play",
}: PlayRegistrationClientProps) {
  const router = useRouter();
  const isGameAuth = surface === "game-auth";
  const [directory, setDirectory] = useState(initialDirectory);
  const [query, setQuery] = useState("");
  const [locationCoords, setLocationCoords] = useState<PlayLocation | null>(
    null,
  );
  const [radiusKm, setRadiusKm] = useState<RadiusOption>(null);
  const [selectedClubId, setSelectedClubId] = useState(() =>
    resolveInitialClubId(
      initialDirectory.clubs,
      initialClubId,
      initialStoreId,
    ),
  );
  const [requestedVerificationChannel, setActiveVerificationChannel] =
    useState<GuestPortalVerificationChannel>(() =>
      resolveInitialVerificationChannel(initialDirectory.verification),
    );
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] =
    useState<GuestPortalOtpStartResponse | null>(null);
  const [telegramAuth, setTelegramAuth] =
    useState<GuestPortalTelegramAuthStartResponse | null>(null);
  const [telegramAuthStatus, setTelegramAuthStatus] =
    useState<GuestPortalTelegramAuthStatusResponse | null>(null);
  const [userCallAuth, setUserCallAuth] =
    useState<GuestPortalUserCallAuthStartResponse | null>(null);
  const [userCallAuthStatus, setUserCallAuthStatus] =
    useState<GuestPortalUserCallAuthStatusResponse | null>(null);
  const [incomingCallLast4, setIncomingCallLast4] =
    useState<GuestPortalIncomingCallLast4StartResponse | null>(null);
  const [incomingCallLast4Code, setIncomingCallLast4Code] = useState("");
  const [portal, setPortal] = useState<GuestPortalPayload | null>(null);
  const [langameMatch, setLangameMatch] =
    useState<GuestPortalLangameMatchResponse | null>(null);
  const [localGameMatch, setLocalGameMatch] =
    useState<GuestPortalLocalGameProfileMatch | null>(null);
  const [activeSummary, setActiveSummary] =
    useState<GuestPortalGameSummary | null>(null);
  const [activeSessionState, setActiveSessionState] =
    useState<ActiveSessionState>(isGameAuth ? "empty" : "loading");
  const [activeSessionMessage, setActiveSessionMessage] = useState<
    string | null
  >(null);
  const [gameConsentAccepted, setGameConsentAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(loadError);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [isLocating, setLocating] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isStartingTelegramAuth, setStartingTelegramAuth] = useState(false);
  const [isPollingTelegramAuth, setPollingTelegramAuth] = useState(false);
  const [isStartingUserCallAuth, setStartingUserCallAuth] = useState(false);
  const [isPollingUserCallAuth, setPollingUserCallAuth] = useState(false);
  const [isCheckingLangame, setCheckingLangame] = useState(false);
  const referralCode = useMemo(
    () => normalizeReferralCode(initialReferralCode),
    [initialReferralCode],
  );
  const openClubSelectionAfterAuth = useCallback(() => {
    router.replace("/game/clubs");
  }, [router]);
  const openActiveGameAfterAuth = useCallback(() => {
    router.replace("/play/game");
  }, [router]);

  const visibleClubs = useMemo(() => {
    const needle = normalizeSearch(query);

    if (!needle) {
      return directory.clubs;
    }

    return directory.clubs.filter((club) =>
      normalizeSearch(
        [
          club.tenant.name,
          club.tenant.slug,
          club.store.name,
          club.store.city,
          club.store.address,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(needle),
    );
  }, [directory.clubs, query]);

  const selectedClub =
    directory.clubs.find((club) => club.id === selectedClubId) ??
    directory.clubs[0] ??
    null;
  const visibleVerification = useMemo(
    () => getVisibleVerificationPlan(directory.verification, surface),
    [directory.verification, surface],
  );
  const activeVerificationChannel = visibleVerification.options.some(
    (option) => option.channel === requestedVerificationChannel,
  )
    ? requestedVerificationChannel
    : resolveInitialVerificationChannel(visibleVerification);
  const normalizedPhone = normalizeGuestPhoneForSubmit(phone);
  const canUsePhoneAuth = Boolean(normalizedPhone);

  const switchFromTelegramToFallback = useCallback(() => {
    const fallback =
      visibleVerification.options.find(
        (option) =>
          option.channel !== "TELEGRAM_BOT" && option.status === "READY",
      ) ??
      visibleVerification.options.find(
        (option) => option.channel !== "TELEGRAM_BOT",
      );

    if (fallback) {
      setActiveVerificationChannel(fallback.channel);
      setMessage(null);
    }
  }, [visibleVerification.options]);
  const canEnterOtpCode =
    challenge?.delivery.status === "DEV_CODE" ||
    challenge?.delivery.status === "SENT";
  const canEnterIncomingCallLast4 =
    incomingCallLast4?.delivery.status === "DEV_CODE" ||
    incomingCallLast4?.delivery.status === "SENT";
  const isRedirectingGameAuth = isGameAuth && Boolean(portal);

  useEffect(() => {
    let isActive = true;

    async function loadActiveSession() {
      try {
        const response = await fetch("/api/guest-portal/session/game-summary", {
          cache: "no-store",
        });

        if (!isActive) {
          return;
        }

        if (response.status === 401) {
          if (!isGameAuth) {
            setActiveSessionState("empty");
            setActiveSummary(null);
            setActiveSessionMessage(null);
          }
          return;
        }

        if (!response.ok) {
          throw new Error(await readMessage(response));
        }

        if (isGameAuth) {
          openActiveGameAfterAuth();
          return;
        }

        setActiveSummary((await response.json()) as GuestPortalGameSummary);
        setActiveSessionState("ready");
        setActiveSessionMessage(null);
      } catch (error) {
        if (!isActive) {
          return;
        }

        if (isGameAuth) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Не удалось проверить активную игровую сессию.",
          );
          return;
        }

        setActiveSessionState("error");
        setActiveSummary(null);
        setActiveSessionMessage(
          error instanceof Error
            ? error.message
            : "Не удалось проверить активную игровую сессию.",
        );
      }
    }

    void loadActiveSession();

    return () => {
      isActive = false;
    };
  }, [isGameAuth, openActiveGameAfterAuth]);

  function selectClub(club: GuestPortalGamificationClub) {
    setSelectedClubId(club.id);
    setChallenge(null);
    setTelegramAuth(null);
    setTelegramAuthStatus(null);
    setUserCallAuth(null);
    setUserCallAuthStatus(null);
    setIncomingCallLast4(null);
    setIncomingCallLast4Code("");
    setCode("");
    setPortal(null);
    setLangameMatch(null);
    setLocalGameMatch(null);
    setMessage(null);
  }

  useEffect(() => {
    if (!selectedClub || !telegramAuth || portal) {
      return;
    }

    let isActive = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function pollTelegramAuth() {
      if (!selectedClub || !telegramAuth) {
        return;
      }

      setPollingTelegramAuth(true);

      try {
        const response = await fetch(
          `${clubApiPath(selectedClub)}/telegram-auth/status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              challengeId: telegramAuth.challengeId,
              ...(referralCode ? { referralCode } : {}),
            }),
          },
        );

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          throw new Error(await readMessage(response));
        }

        const data =
          (await response.json()) as GuestPortalTelegramAuthStatusResponse;
        setTelegramAuthStatus(data);
        setMessage(data.message);

        if (data.status === "CONFIRMED" && data.portal) {
          setPortal(data.portal);
          setLocalGameMatch(data.match ?? null);
          setTelegramAuth(null);
          setLangameMatch(null);
          openClubSelectionAfterAuth();
        }

        if (data.status === "EXPIRED" || data.status === "FAILED") {
          setTelegramAuth(null);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось проверить Telegram-вход.",
        );
      } finally {
        if (isActive) {
          setPollingTelegramAuth(false);
        }
      }
    }

    void pollTelegramAuth();
    intervalId = setInterval(() => void pollTelegramAuth(), 3000);

    return () => {
      isActive = false;

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [
    openClubSelectionAfterAuth,
    portal,
    referralCode,
    selectedClub,
    telegramAuth,
  ]);

  async function locateClubs() {
    if (!navigator.geolocation) {
      setLocationMessage("Браузер не отдает геолокацию.");
      return;
    }

    setLocating(true);
    setLocationMessage("Запрашиваем геолокацию.");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        void refreshDirectoryByLocation(coords, radiusKm);
      },
      () => {
        setLocating(false);
        setLocationMessage("Не удалось получить геолокацию.");
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: 8_000,
      },
    );
  }

  function applyRadius(nextRadiusKm: RadiusOption) {
    setRadiusKm(nextRadiusKm);

    if (!locationCoords) {
      setLocationMessage("Сначала нажмите «Найти рядом».");
      return;
    }

    void refreshDirectoryByLocation(locationCoords, nextRadiusKm);
  }

  function handlePhoneChange(value: string) {
    setPhone(formatGuestPhoneInputValue(value));
  }

  const ensurePhoneForSubmit = useCallback(() => {
    const formattedPhone = formatGuestPhoneInputValue(phone);
    const phoneValue = normalizeGuestPhoneForSubmit(formattedPhone);

    setPhone(formattedPhone);

    if (!phoneValue) {
      setMessage(
        "Введите мобильный телефон: 10 цифр, 8XXXXXXXXXX или +7XXXXXXXXXX.",
      );
      return null;
    }

    return phoneValue;
  }, [phone]);

  const checkLangameMatch = useCallback(async () => {
    const phoneValue = ensurePhoneForSubmit();

    if (!phoneValue) {
      return;
    }

    setCheckingLangame(true);
    setLangameMatch(null);

    try {
      const response = await fetch("/api/guest-portal/session/langame-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneValue }),
      });

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data = (await response.json()) as GuestPortalLangameMatchResponse;
      setLangameMatch(data);
      if (data.portal) {
        setPortal(data.portal);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось проверить гостя в Langame.",
      );
    } finally {
      setCheckingLangame(false);
    }
  }, [ensurePhoneForSubmit]);

  useEffect(() => {
    if (!selectedClub || !userCallAuth || portal) {
      return;
    }

    let isActive = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function pollUserCallAuth() {
      if (!selectedClub || !userCallAuth) {
        return;
      }

      setPollingUserCallAuth(true);

      try {
        const response = await fetch(
          `${clubApiPath(selectedClub)}/user-call-auth/status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              challengeId: userCallAuth.challengeId,
              ...(referralCode ? { referralCode } : {}),
            }),
          },
        );

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          throw new Error(await readMessage(response));
        }

        const data =
          (await response.json()) as GuestPortalUserCallAuthStatusResponse;
        setUserCallAuthStatus(data);
        setMessage(data.message);

        if (data.status === "CONFIRMED" && data.portal) {
          setPortal(data.portal);
          setLocalGameMatch(data.match ?? null);
          setUserCallAuth(null);
          setLangameMatch(null);
          await checkLangameMatch();
          openClubSelectionAfterAuth();
        }

        if (data.status === "EXPIRED" || data.status === "FAILED") {
          setUserCallAuth(null);
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "Не удалось проверить вход по звонку.",
        );
      } finally {
        if (isActive) {
          setPollingUserCallAuth(false);
        }
      }
    }

    void pollUserCallAuth();
    intervalId = setInterval(() => void pollUserCallAuth(), 3000);

    return () => {
      isActive = false;

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [
    checkLangameMatch,
    openClubSelectionAfterAuth,
    portal,
    referralCode,
    selectedClub,
    userCallAuth,
  ]);

  async function refreshDirectoryByLocation(
    coords: PlayLocation,
    nextRadiusKm: RadiusOption,
  ) {
    try {
      const params = new URLSearchParams({
        lat: String(coords.latitude),
        lng: String(coords.longitude),
      });

      if (nextRadiusKm !== null) {
        params.set("radiusKm", String(nextRadiusKm));
      }

      const response = await fetch(
        `/api/guest-portal/gamification/clubs?${params}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data =
        (await response.json()) as GuestPortalGamificationClubDirectory;
      const clubsWithDistance = data.clubs.filter(
        (club) => club.location.distanceKm !== null,
      ).length;

      setDirectory(data);
      setLocationCoords(coords);
      setSelectedClubId((currentId) =>
        data.clubs.some((club) => club.id === currentId)
          ? currentId
          : (data.clubs[0]?.id ?? ""),
      );
      setLocationMessage(
        data.search.radiusApplied
          ? radiusSearchMessage(data)
          : clubsWithDistance > 0
          ? `Нашли ${formatNumber(clubsWithDistance)} клубов с расстоянием.`
          : "Геолокация получена. У клубов пока не заполнены координаты.",
      );
    } catch (error) {
      setLocationMessage(
        error instanceof Error
          ? error.message
          : "Не удалось обновить список по геолокации.",
      );
    } finally {
      setLocating(false);
    }
  }

  async function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClub) {
      setMessage("Выберите клуб для участия.");
      return;
    }

    const phoneValue = ensurePhoneForSubmit();

    if (!phoneValue) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setChallenge(null);
    setTelegramAuth(null);
    setTelegramAuthStatus(null);
    setUserCallAuth(null);
    setUserCallAuthStatus(null);
    setIncomingCallLast4(null);
    setIncomingCallLast4Code("");
    setCode("");
    setPortal(null);
    setLangameMatch(null);
    setLocalGameMatch(null);

    try {
      const response = await fetch(`${clubApiPath(selectedClub)}/otp/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneValue, gameConsentAccepted }),
      });

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data = (await response.json()) as GuestPortalOtpStartResponse;
      setChallenge(data);
      setMessage(data.delivery.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось отправить код подтверждения.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function submitSelectedPhoneVerification(event: FormEvent<HTMLFormElement>) {
    if (activeVerificationChannel === "SMS_CODE") {
      void submitPhone(event);
      return;
    }

    event.preventDefault();
  }

  async function startTelegramAuth() {
    if (!selectedClub) {
      setMessage("Выберите клуб для участия.");
      return;
    }

    setStartingTelegramAuth(true);
    setMessage(null);
    setChallenge(null);
    setTelegramAuth(null);
    setTelegramAuthStatus(null);
    setUserCallAuth(null);
    setUserCallAuthStatus(null);
    setIncomingCallLast4(null);
    setIncomingCallLast4Code("");
    setCode("");
    setPortal(null);
    setLangameMatch(null);
    setLocalGameMatch(null);

    try {
      const response = await fetch(
        `${clubApiPath(selectedClub)}/telegram-auth/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameConsentAccepted }),
        },
      );

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data =
        (await response.json()) as GuestPortalTelegramAuthStartResponse;
      setTelegramAuth(data);
      setTelegramAuthStatus({
        status: "PENDING",
        profileId: null,
        message: data.message,
      });
      setMessage(data.message);
      openTelegramDeepLink(data.botDeepLink);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось создать Telegram-вход.",
      );
    } finally {
      setStartingTelegramAuth(false);
    }
  }

  async function startUserCallAuth() {
    if (!selectedClub) {
      setMessage("Выберите клуб для участия.");
      return;
    }

    const phoneValue = ensurePhoneForSubmit();

    if (!phoneValue) {
      return;
    }

    setStartingUserCallAuth(true);
    setMessage(null);
    setChallenge(null);
    setTelegramAuth(null);
    setTelegramAuthStatus(null);
    setUserCallAuth(null);
    setUserCallAuthStatus(null);
    setIncomingCallLast4(null);
    setIncomingCallLast4Code("");
    setCode("");
    setPortal(null);
    setLangameMatch(null);
    setLocalGameMatch(null);

    try {
      const response = await fetch(
        `${clubApiPath(selectedClub)}/user-call-auth/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phoneValue, gameConsentAccepted }),
        },
      );

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data =
        (await response.json()) as GuestPortalUserCallAuthStartResponse;
      setUserCallAuth(data);
      setUserCallAuthStatus({
        status: "PENDING",
        profileId: null,
        phoneMasked: data.phoneMasked,
        message: data.message,
      });
      setMessage(data.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось создать вход по звонку.",
      );
    } finally {
      setStartingUserCallAuth(false);
    }
  }

  async function startIncomingCallLast4Auth() {
    if (!selectedClub) {
      setMessage("Выберите клуб для участия.");
      return;
    }

    const phoneValue = ensurePhoneForSubmit();

    if (!phoneValue) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setChallenge(null);
    setTelegramAuth(null);
    setTelegramAuthStatus(null);
    setUserCallAuth(null);
    setUserCallAuthStatus(null);
    setIncomingCallLast4(null);
    setIncomingCallLast4Code("");
    setCode("");
    setPortal(null);
    setLangameMatch(null);
    setLocalGameMatch(null);

    try {
      const response = await fetch(
        `${clubApiPath(selectedClub)}/incoming-call-last4/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phoneValue, gameConsentAccepted }),
        },
      );

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data =
        (await response.json()) as GuestPortalIncomingCallLast4StartResponse;
      setIncomingCallLast4(data);
      setMessage(data.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось создать вход по входящему звонку.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyIncomingCallLast4Auth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClub || !incomingCallLast4) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `${clubApiPath(selectedClub)}/incoming-call-last4/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: incomingCallLast4.challengeId,
            code: incomingCallLast4Code,
            ...(referralCode ? { referralCode } : {}),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data =
        (await response.json()) as GuestPortalIncomingCallLast4VerifyResponse;
      setPortal(data.portal);
      setLocalGameMatch(data.match ?? null);
      setIncomingCallLast4(null);
      setLangameMatch(null);
      setMessage("Телефон подтвержден входящим звонком. Гостевой профиль готов.");
      await checkLangameMatch();
      openClubSelectionAfterAuth();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось проверить последние 4 цифры звонка.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClub || !challenge) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`${clubApiPath(selectedClub)}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          code,
          ...(referralCode ? { referralCode } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data = (await response.json()) as GuestPortalOtpVerifyResponse;
      setPortal(data.portal);
      setLocalGameMatch(data.match ?? null);
      setMessage("Телефон подтвержден. Гостевой профиль готов.");
      await checkLangameMatch();
      openClubSelectionAfterAuth();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось проверить код подтверждения.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const headerEyebrow = isGameAuth ? "LeetPlus Game" : "LeetPlus Play";
  const headerTitle = isGameAuth
    ? "Игровой модуль"
    : "Квесты и бонусы клубов";
  const asideEyebrow = isGameAuth
    ? "Авторизация игрока"
    : "Регистрация участника";
  const asideTitle = isGameAuth ? "Способ входа" : "Телефон и клуб";
  const gameAuthPanelSummary = gameAuthMethodSummary(activeVerificationChannel);

  return (
    <main
      className={`min-h-screen ${
        isGameAuth ? "bg-black text-[#edf7f8]" : "bg-[#05080d] text-slate-100"
      } ${isGameAuth ? "lp-game-auth-page" : ""}`}
      style={
        isGameAuth
          ? {
              backgroundImage:
                "linear-gradient(rgba(131, 228, 236, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(169, 228, 199, 0.045) 1px, transparent 1px), radial-gradient(circle at 18% 14%, rgba(131, 228, 236, 0.1), transparent 30%), radial-gradient(circle at 84% 10%, rgba(169, 228, 199, 0.08), transparent 28%)",
              backgroundSize: "72px 72px, 72px 72px, auto, auto",
            }
          : undefined
      }
    >
      {isGameAuth ? (
        <>
          <div className="lp-game-auth-backdrop" aria-hidden="true" />
          <div className="lp-game-auth-veil" aria-hidden="true" />
          <div className="lp-game-auth-scan" aria-hidden="true" />
        </>
      ) : null}

      <div
        className={`mx-auto flex min-h-screen w-full flex-col px-4 py-5 sm:px-6 lg:px-8 ${
          isGameAuth ? "max-w-[1180px]" : "max-w-7xl"
        } ${isGameAuth ? "lp-game-auth-shell" : ""}`}
      >
        <header
          className={`flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4 ${
            isGameAuth ? "lp-game-auth-topbar" : ""
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            {isGameAuth ? (
              <span className="lp-game-auth-brand-mark" aria-hidden="true" />
            ) : (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-300/[0.12] text-sm font-black text-emerald-100">
                LP
              </div>
            )}
            <div className="min-w-0">
              <p
                className={`text-xs font-bold uppercase text-emerald-300 ${
                  isGameAuth ? "lp-game-auth-header-eyebrow" : ""
                }`}
              >
                {headerEyebrow}
              </p>
              <h1
                className={`truncate text-xl font-black text-white sm:text-2xl ${
                  isGameAuth ? "lp-game-auth-header-title" : ""
                }`}
              >
                {headerTitle}
              </h1>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 text-sm ${
              isGameAuth ? "lp-game-auth-header-actions" : ""
            }`}
          >
            {isGameAuth ? (
              <span className="lp-game-auth-status">
                <span className="lp-game-auth-status-dot" aria-hidden="true" />
                Вход
              </span>
            ) : null}
            {isGameAuth ? (
              <Link
                className="lp-game-auth-nav-link rounded-lg border border-white/10 px-3 py-2 font-bold text-slate-200 transition hover:border-white/25 hover:bg-white/[0.06]"
                href="/start"
              >
                Выбор модулей
              </Link>
            ) : null}
            <Link
              className={`rounded-lg border border-white/10 px-3 py-2 font-bold text-slate-200 transition hover:border-white/25 hover:bg-white/[0.06] ${
                isGameAuth ? "lp-game-auth-nav-link" : ""
              }`}
              href="/login"
            >
              Вход для команды
            </Link>
          </div>
        </header>

        {referralCode ? (
          <section className="mt-4 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-3 text-sm text-cyan-50">
            <p className="font-black">Вы открыли приглашение в LeetPlus Play</p>
            <p className="mt-1 leading-6 text-cyan-100/85">
              Код {referralCode} сохранен в ссылке. Выберите клуб, подтвердите
              телефон и начните игру; если правило рефералок активно, Guest Game
              Hub засчитает приглашение пригласившему профилю.
            </p>
          </section>
        ) : null}

        {isGameAuth ? null : (
          <ActiveGameSessionPanel
            message={activeSessionMessage}
            state={activeSessionState}
            summary={activeSummary}
          />
        )}

        <section
          className={`grid flex-1 gap-5 py-6 ${
            isGameAuth
              ? "lp-game-auth-flow lg:grid-cols-[minmax(0,1fr)_436px] lg:items-start lg:gap-[clamp(32px,5vw,92px)] lg:pt-24"
              : "lg:grid-cols-[minmax(0,1fr)_430px]"
          }`}
        >
          {isGameAuth ? (
            <div className="lp-game-auth-intro-slot">
              <GameAuthIntro />
            </div>
          ) : null}

          {isGameAuth ? null : (
            <div className="space-y-4">
            <div className="lp-game-auth-search-card rounded-lg border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/20">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-400">
                    Город, клуб или адрес
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 text-base font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/70"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Например: 1337, Екатеринбург"
                    value={query}
                  />
                </label>
                <button
                  className="mt-0 min-h-11 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-4 text-sm font-black text-cyan-100 transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-60 md:mt-6"
                  disabled={isLocating}
                  onClick={locateClubs}
                  type="button"
                >
                  {isLocating ? "Ищем..." : "Найти рядом"}
                </button>
              </div>

              {directory.cities.length > 0 ? (
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                  {directory.cities.slice(0, 12).map((city) => (
                    <button
                      className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-emerald-300/40 hover:text-emerald-100"
                      key={city}
                      onClick={() => setQuery(city)}
                      type="button"
                    >
                      {city}
                    </button>
                  ))}
                </div>
              ) : null}

              {locationCoords || directory.search.locationReady ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs font-bold uppercase text-slate-400">
                    Радиус
                  </span>
                  {RADIUS_OPTIONS.map((option) => {
                    const isActive = radiusKm === option;

                    return (
                      <button
                        className={`rounded-lg border px-3 py-2 text-sm font-black transition ${
                          isActive
                            ? "border-emerald-300/50 bg-emerald-300/[0.14] text-emerald-100"
                            : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-cyan-300/40 hover:text-cyan-100"
                        }`}
                        key={option ?? "all"}
                        onClick={() => applyRadius(option)}
                        type="button"
                      >
                        {radiusOptionLabel(option)}
                      </button>
                    );
                  })}
                  {directory.search.hiddenWithoutCoordinates > 0 ? (
                    <span className="text-xs leading-5 text-slate-500">
                      Без координат:{" "}
                      {formatNumber(directory.search.hiddenWithoutCoordinates)}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {locationMessage ? (
                <p className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-2 text-sm leading-6 text-cyan-100">
                  {locationMessage}
                </p>
              ) : null}
            </div>

            <div className={isGameAuth ? "lp-game-auth-map-slot" : ""}>
              <ClubMap
                clubs={visibleClubs}
                onSelectClub={selectClub}
                selectedClubId={selectedClub?.id ?? ""}
                userLocation={locationCoords}
              />
            </div>

            <div
              className={`space-y-3 ${isGameAuth ? "lp-game-auth-club-list" : ""}`}
            >
              {visibleClubs.length > 0 ? (
                visibleClubs.map((club) => (
                  <ClubOption
                    club={club}
                    isSelected={club.id === selectedClub?.id}
                    key={club.id}
                    onSelect={() => selectClub(club)}
                  />
                ))
              ) : (
                <div className="rounded-lg border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-100">
                  Клубы по этому запросу не найдены.
                </div>
              )}
            </div>
            </div>
          )}

          <aside
            className={`rounded-lg border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/25 sm:p-5 ${
              isGameAuth ? "lp-game-auth-panel" : ""
            }`}
          >
            {isGameAuth ? (
              <div className="lp-game-auth-panel-head">
                <span>
                  <span className="lp-game-auth-panel-title">
                    {asideTitle}
                  </span>
                  <span className="lp-game-auth-panel-copy">
                    {gameAuthPanelSummary}
                  </span>
                </span>
                <span className="lp-game-auth-node" aria-hidden="true">
                  <GameAuthNodeIcon />
                </span>
              </div>
            ) : (
              <div className="mb-5">
                <p className="text-xs font-bold uppercase text-emerald-300">
                  {asideEyebrow}
                </p>
                <h2 className="mt-1 text-2xl font-black text-white">
                  {asideTitle}
                </h2>
              </div>
            )}

            {selectedClub ? (
              <div
                className={`space-y-5 ${
                  isGameAuth ? "lp-game-auth-panel-stack" : ""
                }`}
              >
                {isGameAuth ? null : <SelectedClubSummary club={selectedClub} />}

                {isRedirectingGameAuth ? (
                  <GameAuthRedirectSummary />
                ) : portal ? (
                    <VerifiedSummary
                      canCheckLangameMatch={canUsePhoneAuth}
                      continueHref={isGameAuth ? "/game/clubs" : "/play/game"}
                      isCheckingLangame={isCheckingLangame}
                      langameMatch={langameMatch}
                      localGameMatch={localGameMatch}
                      portal={portal}
                    />
                ) : (
                  <div
                    className={`space-y-4 ${
                      isGameAuth ? "lp-game-auth-auth-stack" : ""
                    }`}
                  >
                    <VerificationPlanPanel
                      activeChannel={activeVerificationChannel}
                      eyebrow={isGameAuth ? "Авторизация" : undefined}
                      onSelect={setActiveVerificationChannel}
                      title={isGameAuth ? "Способ входа" : undefined}
                      variant={isGameAuth ? "game-auth" : "default"}
                      verification={visibleVerification}
                    />

                    <label
                      className={`flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-slate-300 ${
                        isGameAuth ? "lp-game-auth-consent" : ""
                      }`}
                    >
                      <input
                        checked={gameConsentAccepted}
                        className="mt-1 size-4 rounded border-white/20 bg-white/[0.06]"
                        onChange={(event) =>
                          setGameConsentAccepted(event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        Я хочу участвовать в квестах LeetPlus и согласен на
                        обработку телефона для входа, игрового профиля,
                        начисления бонусов и безопасной сверки с Langame.
                      </span>
                    </label>

                    {activeVerificationChannel === "TELEGRAM_BOT" ? (
                      <TelegramAuthPanel
                        disabled={!gameConsentAccepted}
                        isPolling={isPollingTelegramAuth}
                        isStarting={isStartingTelegramAuth}
                        onUseOtherMethod={switchFromTelegramToFallback}
                        onStart={startTelegramAuth}
                        telegramAuth={telegramAuth}
                        telegramAuthStatus={telegramAuthStatus}
                        verification={visibleVerification}
                      />
                    ) : (
                      <form
                        className={`space-y-3 ${
                          isGameAuth ? "lp-game-auth-phone-form" : ""
                        }`}
                        onSubmit={submitSelectedPhoneVerification}
                      >
                        <label className="block">
                          <span className="text-xs font-bold uppercase text-slate-400">
                            Введите свой номер телефона
                          </span>
                          <input
                            className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 text-base font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/70"
                            autoComplete="tel"
                            inputMode="tel"
                            onBlur={() => handlePhoneChange(phone)}
                            onChange={(event) =>
                              handlePhoneChange(event.target.value)
                            }
                            placeholder="+7 999 999-99-99"
                            type="tel"
                            value={phone}
                          />
                        </label>

                        {activeVerificationChannel === "USER_CALL" ? (
                          <UserCallAuthPanel
                            disabled={!gameConsentAccepted || !canUsePhoneAuth}
                            isPolling={isPollingUserCallAuth}
                            isStarting={isStartingUserCallAuth}
                            onStart={startUserCallAuth}
                            userCallAuth={userCallAuth}
                            userCallAuthStatus={userCallAuthStatus}
                            verification={visibleVerification}
                          />
                        ) : null}

                        {activeVerificationChannel === "SMS_CODE" ? (
                          <div className="lp-game-auth-channel-detail rounded-lg border border-emerald-300/25 bg-emerald-300/[0.06] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="lp-game-auth-channel-title mt-1 text-lg font-black text-white">
                                  SMS-код
                                </h3>
                              </div>
                            </div>
                            <button
                              className="lp-game-auth-channel-primary mt-3 min-h-11 w-full rounded-lg bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={
                                isSubmitting ||
                                !canUsePhoneAuth ||
                                !gameConsentAccepted
                              }
                              type="submit"
                            >
                              {isSubmitting ? "Отправляем..." : "Получить код"}
                            </button>
                          </div>
                        ) : null}

                        {activeVerificationChannel ===
                        "INCOMING_CALL_LAST4" ? (
                          <IncomingCallLast4Panel
                            disabled={!gameConsentAccepted || !canUsePhoneAuth}
                            incomingCallLast4={incomingCallLast4}
                            isStarting={isSubmitting}
                            onStart={startIncomingCallLast4Auth}
                            verification={visibleVerification}
                          />
                        ) : null}
                      </form>
                    )}

                    {activeVerificationChannel === "SMS_CODE" && challenge ? (
                      <form className="space-y-3" onSubmit={submitCode}>
                        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-sm font-bold text-white">
                            {otpDeliveryStatusLabel(
                              challenge.delivery.status,
                            )}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-slate-300">
                            {challenge.delivery.message}
                          </p>
                          {challenge.delivery.devCode ? (
                            <p className="mt-2 rounded-lg bg-emerald-300/10 px-3 py-2 font-mono text-lg font-black tracking-[0.2em] text-emerald-100">
                              {challenge.delivery.devCode}
                            </p>
                          ) : null}
                        </div>

                        <label className="block">
                          <span className="text-xs font-bold uppercase text-slate-400">
                            Код из сообщения
                          </span>
                          <input
                            className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 text-center font-mono text-xl font-black tracking-[0.25em] text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/70"
                            inputMode="numeric"
                            maxLength={6}
                            onChange={(event) =>
                              setCode(event.target.value.replace(/\D/g, ""))
                            }
                            placeholder="000000"
                            value={code}
                          />
                        </label>
                        <button
                          className="min-h-11 w-full rounded-lg bg-cyan-200 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            isSubmitting || !canEnterOtpCode || code.length < 6
                          }
                          type="submit"
                        >
                          {isSubmitting ? "Проверяем..." : "Подтвердить"}
                        </button>
                      </form>
                    ) : null}

                    {activeVerificationChannel === "INCOMING_CALL_LAST4" &&
                    incomingCallLast4 ? (
                      <form
                        className="space-y-3"
                        onSubmit={verifyIncomingCallLast4Auth}
                      >
                        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-sm font-bold text-white">
                            {incomingCallLast4StatusLabel(
                              incomingCallLast4.delivery.status,
                            )}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-slate-300">
                            {incomingCallLast4.delivery.message}
                          </p>
                          {incomingCallLast4.delivery.devCode ? (
                            <p className="mt-2 rounded-lg bg-fuchsia-300/10 px-3 py-2 font-mono text-lg font-black tracking-[0.2em] text-fuchsia-100">
                              {incomingCallLast4.delivery.devCode}
                            </p>
                          ) : null}
                        </div>

                        <label className="block">
                          <span className="text-xs font-bold uppercase text-slate-400">
                            Последние 4 цифры номера звонка
                          </span>
                          <input
                            className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 text-center font-mono text-xl font-black tracking-[0.25em] text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-300/70"
                            inputMode="numeric"
                            maxLength={4}
                            onChange={(event) =>
                              setIncomingCallLast4Code(
                                event.target.value.replace(/\D/g, ""),
                              )
                            }
                            placeholder="0000"
                            value={incomingCallLast4Code}
                          />
                        </label>
                        <button
                          className="min-h-11 w-full rounded-lg bg-fuchsia-200 px-4 text-sm font-black text-slate-950 transition hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            isSubmitting ||
                            !canEnterIncomingCallLast4 ||
                            incomingCallLast4Code.length < 4
                          }
                          type="submit"
                        >
                          {isSubmitting ? "Проверяем..." : "Подтвердить звонок"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                )}

                {message ? (
                  <p className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm leading-6 text-slate-200">
                    {message}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-100">
                Сейчас нет клубов с активной геймификацией.
              </div>
            )}
          </aside>
        </section>

        {isGameAuth ? (
          <LegalEntityInfo compact className="lp-game-auth-legal" />
        ) : null}
      </div>
      {isGameAuth ? <style>{gameAuthCss}</style> : null}
    </main>
  );
}

function GameAuthIntro() {
  return (
    <div className="lp-game-auth-intro">
      <div className="lp-game-auth-chapter">Сессия входа</div>
      <h2>Вход в игровой модуль</h2>
      <p>
        Подтвердите доступ удобным способом, чтобы открыть задания, рейтинг и награды.
      </p>
      <div className="lp-game-auth-rank-strip" aria-label="Прогресс доступа">
        <div>
          <span>Сезон 04</span>
          <span aria-hidden="true" />
          <span>58%</span>
        </div>
      </div>
    </div>
  );
}

function ActiveGameSessionPanel({
  state,
  summary,
  message,
}: {
  state: ActiveSessionState;
  summary: GuestPortalGameSummary | null;
  message: string | null;
}) {
  if (state === "empty") {
    return null;
  }

  if (state === "loading") {
    return (
      <section className="mt-5 rounded-lg border border-white/10 bg-[#0b111c] p-4">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="mt-3 h-7 w-56 rounded bg-white/10" />
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="h-14 rounded-lg bg-white/[0.06]" />
          <div className="h-14 rounded-lg bg-white/[0.06]" />
          <div className="h-14 rounded-lg bg-white/[0.06]" />
          <div className="h-14 rounded-lg bg-white/[0.06]" />
        </div>
      </section>
    );
  }

  if (state === "error" || !summary) {
    return (
      <section className="mt-5 rounded-lg border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-100">
        {message ?? "Активную игровую сессию сейчас не удалось проверить."}
      </section>
    );
  }

  return (
    <section className="mt-5 rounded-lg border border-emerald-300/25 bg-emerald-300/[0.08] p-4 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-emerald-200">
            Активная игра
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">
            {summary.profile.displayName}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {summary.store.name}
            {summary.store.address ? `, ${summary.store.address}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill tone="emerald">Уровень {summary.profile.level}</StatusPill>
            <StatusPill
              tone={summary.account.langameLinked ? "cyan" : "amber"}
            >
              {summary.account.stateLabel}
            </StatusPill>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Link
            className="flex min-h-11 items-center justify-center rounded-lg bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200"
            href="/play/game"
          >
            Продолжить игру
          </Link>
          <Link
            className="flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-4 text-sm font-bold text-slate-100 transition hover:border-white/30"
            href="/game/clubs"
          >
            Выбрать клуб
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Metric label="XP" value={summary.profile.xp} />
        <Metric
          label="Бонусы"
          value={
            summary.loyalty.bonusBalance === null
              ? "нет"
              : formatNumber(summary.loyalty.bonusBalance)
          }
        />
        <Metric
          label="Награды"
          value={summary.rewards.summary.ready}
        />
        <Metric label="Квесты" value={summary.missions.total} />
      </div>
    </section>
  );
}

function ClubMap({
  clubs,
  selectedClubId,
  userLocation,
  onSelectClub,
}: {
  clubs: GuestPortalGamificationClub[];
  selectedClubId: string;
  userLocation: PlayLocation | null;
  onSelectClub: (club: GuestPortalGamificationClub) => void;
}) {
  const mappedClubs = clubs.filter(
    (club) =>
      club.location.latitude !== null && club.location.longitude !== null,
  );
  const missingCoordinates = clubs.length - mappedClubs.length;
  const points = [
    ...mappedClubs.map((club) => ({
      latitude: club.location.latitude ?? 0,
      longitude: club.location.longitude ?? 0,
    })),
    ...(userLocation ? [userLocation] : []),
  ];
  const viewport = buildMapViewport(points);
  const selectedClub =
    clubs.find((club) => club.id === selectedClubId) ?? clubs[0];

  return (
    <div className="rounded-lg border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/20">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">
            Карта клубов
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-200">
            {mappedClubs.length > 0
              ? `На карте: ${formatNumber(mappedClubs.length)}`
              : "Координаты клубов не заполнены"}
          </p>
        </div>
        {userLocation ? (
          <span className="rounded-lg bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">
            Вы рядом
          </span>
        ) : null}
      </div>

      <div className="relative h-72 overflow-hidden rounded-lg border border-white/10 bg-[#070b12]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:36px_36px]" />
        <div className="absolute left-[12%] top-[30%] h-px w-[76%] rotate-[-8deg] bg-emerald-300/15" />
        <div className="absolute left-[20%] top-[58%] h-px w-[62%] rotate-[12deg] bg-cyan-300/15" />

        {userLocation && viewport ? (
          <div
            className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-100 bg-cyan-300 shadow-lg shadow-cyan-500/25"
            style={mapPointStyle(userLocation, viewport)}
            title="Ваше местоположение"
          />
        ) : null}

        {viewport
          ? mappedClubs.map((club, index) => {
              const position = mapPointStyle(
                {
                  latitude: club.location.latitude ?? 0,
                  longitude: club.location.longitude ?? 0,
                },
                viewport,
                index,
              );
              const isSelected = club.id === selectedClubId;

              return (
                <button
                  aria-label={`Выбрать ${club.store.name}`}
                  className={`absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-black shadow-lg transition ${
                    isSelected
                      ? "z-20 border-emerald-100 bg-emerald-300 text-slate-950 shadow-emerald-500/30"
                      : "z-10 border-white/30 bg-slate-950 text-slate-100 shadow-black/40 hover:border-cyan-200 hover:bg-cyan-200 hover:text-slate-950"
                  }`}
                  key={club.id}
                  onClick={() => onSelectClub(club)}
                  style={position}
                  title={club.store.name}
                  type="button"
                >
                  {index + 1}
                </button>
              );
            })
          : null}

        {mappedClubs.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm leading-6 text-slate-400">
            Карта станет доступна после заполнения координат клубов.
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="min-w-0">
          <p className="truncate font-bold text-white">
            {selectedClub?.store.name ?? "Клуб не выбран"}
          </p>
          {selectedClub ? (
            <p className="mt-1 truncate text-slate-400">
              {[selectedClub.store.city, selectedClub.store.address]
                .filter(Boolean)
                .join(", ") || selectedClub.tenant.name}
            </p>
          ) : null}
        </div>
        {missingCoordinates > 0 ? (
          <span className="shrink-0 rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-400">
            Без координат: {formatNumber(missingCoordinates)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ClubOption({
  club,
  isSelected,
  onSelect,
}: {
  club: GuestPortalGamificationClub;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`w-full rounded-lg border p-4 text-left transition ${
        isSelected
          ? "border-emerald-300/60 bg-emerald-300/[0.10]"
          : "border-white/10 bg-[#0b111c] hover:border-white/25 hover:bg-white/[0.04]"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-slate-400">
            {club.store.city ?? "Город не указан"}
          </p>
          <h3 className="mt-1 break-words text-lg font-black text-white">
            {club.store.name}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            {club.store.address ?? club.tenant.name}
          </p>
        </div>
        {club.location.distanceKm !== null ? (
          <span className="rounded-lg bg-cyan-300/10 px-3 py-1 text-sm font-black text-cyan-100">
            {formatNumber(club.location.distanceKm)} км
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Metric label="Миссии" value={club.gamification.activeMissions} />
        <Metric label="Лутбоксы" value={club.gamification.activeLootBoxes} />
        <Metric label="Сезоны" value={club.gamification.activeSeasons} />
        <Metric
          label="Квесты"
          value={club.gamification.configuredByStore ? "включены" : "по правилам"}
        />
        <Metric
          label="Langame"
          value={club.gamification.bonusWriteReady ? "готов" : "очередь"}
        />
      </div>
    </button>
  );
}

function VerificationPlanPanel({
  activeChannel,
  eyebrow = "Вход участника",
  onSelect,
  title = "Каналы верификации",
  variant = "default",
  verification,
}: {
  activeChannel: GuestPortalVerificationChannel;
  eyebrow?: string;
  onSelect: (channel: GuestPortalVerificationChannel) => void;
  title?: string;
  variant?: "default" | "game-auth";
  verification: GuestPortalGamificationClubDirectory["verification"];
}) {
  const options = verification.options
    .slice()
    .sort((left, right) => left.rank - right.rank);

  if (options.length === 0) {
    return null;
  }

  if (variant === "game-auth") {
    return (
      <div
        aria-label="Способ авторизации"
        className="lp-game-auth-method-stack"
        role="radiogroup"
      >
        {options.map((option) => {
          const active = option.channel === activeChannel;

          return (
            <button
              aria-checked={active}
              className={`lp-game-auth-method ${active ? "is-selected" : ""}`}
              key={option.channel}
              onClick={() => onSelect(option.channel)}
              role="radio"
              type="button"
            >
              <span className="lp-game-auth-method-icon" aria-hidden="true">
                <VerificationChannelIcon channel={option.channel} />
              </span>
              <span className="lp-game-auth-method-text">
                <span className="lp-game-auth-method-title">
                  {gameAuthMethodTitle(option.channel, option.label)}
                </span>
                <span className="lp-game-auth-method-copy">
                  {gameAuthMethodCopy(option)}
                </span>
              </span>
              <span className="lp-game-auth-method-state">
                {active
                  ? "Выбрано"
                  : option.status === "READY"
                    ? "Доступно"
                    : option.statusLabel}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-lg font-black text-white">
            {title}
          </h3>
        </div>
        <StatusPill tone={verification.phoneRequired ? "cyan" : "emerald"}>
          {verification.phoneRequired ? "телефон обязателен" : "без телефона"}
        </StatusPill>
      </div>

      <div className="mt-3 space-y-2">
        {options.map((option) => {
          const recommended =
            option.channel === verification.recommendedChannel;
          const active = option.channel === activeChannel;

          return (
            <button
              className={`rounded-lg border px-3 py-2 ${
                active
                  ? "border-emerald-300 bg-emerald-300/[0.11]"
                  : recommended
                  ? "border-emerald-300/25 bg-emerald-300/[0.07]"
                  : "border-white/10 bg-[#070b12]"
              } text-left transition hover:border-emerald-300/60 hover:bg-emerald-300/[0.08]`}
              key={option.channel}
              onClick={() => onSelect(option.channel)}
              type="button"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                    active
                      ? "bg-white text-slate-950"
                      : recommended
                      ? "bg-emerald-300 text-slate-950"
                      : "bg-white/[0.08] text-slate-200"
                  }`}
                >
                  {option.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-white">{option.label}</p>
                    <StatusPill tone={verificationStatusTone(option.status)}>
                      {option.statusLabel}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {option.message}
                    {option.botUsername ? ` @${option.botUsername}` : ""}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TelegramAuthPanel({
  verification,
  telegramAuth,
  telegramAuthStatus,
  disabled,
  isStarting,
  isPolling,
  onUseOtherMethod,
  onStart,
}: {
  verification: GuestPortalGamificationClubDirectory["verification"];
  telegramAuth: GuestPortalTelegramAuthStartResponse | null;
  telegramAuthStatus: GuestPortalTelegramAuthStatusResponse | null;
  disabled: boolean;
  isStarting: boolean;
  isPolling: boolean;
  onUseOtherMethod: () => void;
  onStart: () => void;
}) {
  const [showNotice, setShowNotice] = useState(false);
  const telegramOption = verification.options.find(
    (option) => option.channel === "TELEGRAM_BOT",
  );
  const ready = telegramOption?.status === "READY";
  const authStarted = Boolean(telegramAuth);

  return (
    <div className="lp-game-auth-channel-detail rounded-lg border border-emerald-300/25 bg-emerald-300/[0.07] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="lp-game-auth-channel-title mt-1 text-lg font-black text-white">
            Telegram-бот
          </h3>
        </div>
      </div>

      {telegramAuthStatus ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#070b12] px-3 py-2">
          <p className="text-sm font-bold text-white">
            {telegramAuthStatusLabel(telegramAuthStatus.status)}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            {telegramAuthStatus.message}
          </p>
        </div>
      ) : null}

      <div className="lp-game-auth-channel-actions mt-3">
        <button
          className="lp-game-auth-channel-primary min-h-11 w-full rounded-lg bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || !ready || isStarting || authStarted}
          onClick={() => setShowNotice(true)}
          type="button"
        >
          {isStarting
            ? "Создаем вход..."
            : authStarted
              ? isPolling
                ? "Проверяем Telegram..."
                : "Ожидаем контакт в Telegram"
              : "Войти через Telegram"}
        </button>
      </div>

      {telegramAuth ? (
        <div className="lp-game-auth-channel-meta mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400">
          <span>Код {telegramAuth.codeMasked}</span>
          {telegramAuth.botUsername ? <span>@{telegramAuth.botUsername}</span> : null}
          {isPolling ? <span>проверяем...</span> : null}
        </div>
      ) : null}

      {telegramAuth ? (
        <p className="lp-game-auth-channel-note mt-2 text-xs leading-5 text-slate-300">
          Telegram уже открыт отдельным окном или приложением. Поделитесь
          телефоном в боте и вернитесь на сайт: вход завершится автоматически.
        </p>
      ) : null}

      {disabled ? (
        <p className="lp-game-auth-channel-note mt-2 text-xs leading-5 text-amber-100">
          Сначала подтвердите согласие на участие в квестах.
        </p>
      ) : !ready ? (
        <p className="lp-game-auth-channel-note mt-2 text-xs leading-5 text-amber-100">
          Telegram-вход включится после настройки бота; используйте код по
          телефону.
        </p>
      ) : null}

      {showNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-cyan-200/25 bg-[#071013] p-5 shadow-2xl shadow-cyan-950/40">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
              Telegram-вход
            </p>
            <h3 className="mt-2 text-2xl font-black text-white">
              Продолжить через бота?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Сейчас откроется Telegram. В боте нажмите Start и поделитесь
              своим телефоном кнопкой Telegram. После подтверждения можно
              вернуться на сайт, остаться в боте или открыть Mini App.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                className="min-h-11 rounded-lg border border-white/15 px-4 text-sm font-black text-slate-100 transition hover:border-cyan-200/60"
                onClick={() => {
                  setShowNotice(false);
                  onUseOtherMethod();
                }}
                type="button"
              >
                Другой способ входа
              </button>
              <button
                className="min-h-11 rounded-lg bg-cyan-200 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
                onClick={() => {
                  setShowNotice(false);
                  onStart();
                }}
                type="button"
              >
                Продолжить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserCallAuthPanel({
  verification,
  userCallAuth,
  userCallAuthStatus,
  disabled,
  isStarting,
  isPolling,
  onStart,
}: {
  verification: GuestPortalGamificationClubDirectory["verification"];
  userCallAuth: GuestPortalUserCallAuthStartResponse | null;
  userCallAuthStatus: GuestPortalUserCallAuthStatusResponse | null;
  disabled: boolean;
  isStarting: boolean;
  isPolling: boolean;
  onStart: () => void;
}) {
  const userCallOption = verification.options.find(
    (option) => option.channel === "USER_CALL",
  );
  const ready = userCallOption?.status === "READY";
  const freeCall = Boolean(userCallOption?.freeCall || userCallAuth?.freeCall);

  return (
    <div className="lp-game-auth-channel-detail rounded-lg border border-cyan-300/25 bg-cyan-300/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="lp-game-auth-channel-title mt-1 text-lg font-black text-white">
            Звонок на бесплатный номер
          </h3>
          {freeCall ? (
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
              Звонок будет сброшен сразу после проверки
            </p>
          ) : null}
        </div>
      </div>

      {userCallAuthStatus ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#070b12] px-3 py-2">
          <p className="text-sm font-bold text-white">
            {userCallAuthStatusLabel(userCallAuthStatus.status)}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            {userCallAuthStatus.message}
          </p>
        </div>
      ) : null}

      <div className="lp-game-auth-channel-actions mt-3">
        {userCallAuth?.callHref ? (
          <a
            className="lp-game-auth-call-action lp-game-auth-channel-primary flex min-h-11 w-full items-center justify-center rounded-lg bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
            href={userCallAuth.callHref}
          >
            Позвонить бесплатно: {userCallAuth.callNumber}
          </a>
        ) : (
          <button
            className="lp-game-auth-channel-primary min-h-11 w-full rounded-lg bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled || !ready || isStarting}
            onClick={onStart}
            type="button"
          >
            {isStarting ? "Создаем..." : "Создать вход по звонку"}
          </button>
        )}
      </div>

      {userCallAuth ? (
        <div className="lp-game-auth-channel-meta mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400">
          <span>{userCallAuth.phoneMasked}</span>
          {isPolling ? <span>проверяем...</span> : null}
        </div>
      ) : null}

      {disabled ? (
        <p className="lp-game-auth-channel-note mt-2 text-xs leading-5 text-amber-100">
          Введите телефон и подтвердите согласие, чтобы создать вход по звонку.
        </p>
      ) : !ready ? (
        <p className="lp-game-auth-channel-note mt-2 text-xs leading-5 text-amber-100">
          Звонок включится после настройки провайдера подтверждения;
          попробуйте другой доступный способ или повторите позже.
        </p>
      ) : null}
    </div>
  );
}

function IncomingCallLast4Panel({
  verification,
  incomingCallLast4,
  disabled,
  isStarting,
  onStart,
}: {
  verification: GuestPortalGamificationClubDirectory["verification"];
  incomingCallLast4: GuestPortalIncomingCallLast4StartResponse | null;
  disabled: boolean;
  isStarting: boolean;
  onStart: () => void;
}) {
  const option = verification.options.find(
    (item) => item.channel === "INCOMING_CALL_LAST4",
  );
  const ready = option?.status === "READY";

  return (
    <div className="rounded-lg border border-fuchsia-300/25 bg-fuchsia-300/[0.05] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="mt-1 text-lg font-black text-white">
            Входящий звонок
          </h3>
        </div>
      </div>

      <button
        className="mt-3 min-h-11 w-full rounded-lg border border-fuchsia-300/35 px-4 text-sm font-black text-fuchsia-100 transition hover:border-fuchsia-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500 disabled:opacity-70"
        disabled={disabled || !ready || isStarting}
        onClick={onStart}
        type="button"
      >
        {isStarting ? "Создаем..." : "Получить входящий звонок"}
      </button>

      {incomingCallLast4 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400">
          <span>{incomingCallLast4.phoneMasked}</span>
          <span>
            {incomingCallLast4StatusLabel(incomingCallLast4.delivery.status)}
          </span>
        </div>
      ) : null}

      {disabled ? (
        <p className="mt-2 text-xs leading-5 text-amber-100">
          Введите телефон и подтвердите согласие, чтобы запросить звонок.
        </p>
      ) : !ready ? (
        <p className="mt-2 text-xs leading-5 text-amber-100">
          Канал оставлен резервом и включится после настройки call-provider.
        </p>
      ) : null}
    </div>
  );
}

function SelectedClubSummary({ club }: { club: GuestPortalGamificationClub }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase text-slate-400">
        Выбранный клуб
      </p>
      <h3 className="mt-1 text-xl font-black text-white">{club.store.name}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {[club.store.city, club.store.address].filter(Boolean).join(", ") ||
          club.tenant.name}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusPill tone="emerald">
          {formatNumber(club.gamification.activeRules)} активных правил
        </StatusPill>
        <StatusPill
          tone={club.gamification.configuredByStore ? "cyan" : "amber"}
        >
          {club.gamification.configuredByStore
            ? "Квесты включены в клубе"
            : "Доступно по активным правилам"}
        </StatusPill>
        <StatusPill tone={club.gamification.bonusWriteReady ? "cyan" : "amber"}>
          {club.gamification.bonusWriteReady
            ? "Бонусы Langame готовы"
            : "Бонусы через очередь"}
        </StatusPill>
      </div>
    </div>
  );
}

function GameAuthRedirectSummary() {
  return (
    <div className="rounded-lg border border-cyan-300/30 bg-cyan-300/[0.08] p-4">
      <p className="text-xs font-bold uppercase text-cyan-200">
        Вход подтвержден
      </p>
      <h3 className="mt-1 text-xl font-black text-white">
        Открываем выбор клуба
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Сейчас покажем клубы, подключенные к LeetPlus Game.
      </p>
      <Link
        className="mt-4 flex min-h-11 items-center justify-center rounded-lg bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
        href="/game/clubs"
      >
        Перейти к выбору клуба
      </Link>
    </div>
  );
}

function VerifiedSummary({
  continueHref,
  portal,
  langameMatch,
  localGameMatch,
  isCheckingLangame,
  canCheckLangameMatch,
}: {
  continueHref: string;
  portal: GuestPortalPayload;
  langameMatch: GuestPortalLangameMatchResponse | null;
  localGameMatch: GuestPortalLocalGameProfileMatch | null;
  isCheckingLangame: boolean;
  canCheckLangameMatch: boolean;
}) {
  const nextActions = portal.gamification.nextActions.slice(0, 3);
  const profileMatch = langameMatch ?? localGameMatch;
  const langameSources = langameMatch?.sources ?? [];
  const langameResultsCount = countLangameResults(langameMatch);
  const backfilled = profileMatch?.backfilled ?? null;
  const hasBackfilled = hasBackfilledGameItems(backfilled);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-300/30 bg-emerald-300/[0.08] p-4">
        <p className="text-xs font-bold uppercase text-emerald-200">
          Участник подтвержден
        </p>
        <h3 className="mt-1 text-2xl font-black text-white">
          {portal.profile.displayName}
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill tone="emerald">Игровой профиль создан</StatusPill>
          <StatusPill
            tone={
              portal.guestSnapshot.participation.accountState ===
              "LANGAME_SYNCED"
                ? "cyan"
                : "amber"
            }
          >
            {portal.guestSnapshot.participation.accountStateLabel}
          </StatusPill>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Уровень" value={portal.profile.level} />
          <Metric label="XP" value={portal.profile.xp} />
          <Metric
            label="Бонусы"
            value={
              portal.loyalty.bonusBalance === null
                ? "нет"
                : formatNumber(portal.loyalty.bonusBalance)
            }
          />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-slate-400">
              Langame
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {isCheckingLangame && !langameMatch
                ? "Проверяем подтвержденный телефон"
                : langameMatch
                ? langameMatchStatusLabel(langameMatch.status)
                : localGameMatch
                ? localGameMatchStatusLabel(localGameMatch.status)
                : "Проверка еще не выполнена"}
            </p>
          </div>
          <span className="rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-2 text-xs font-black uppercase text-cyan-100">
            {isCheckingLangame ? "сверяем" : "автоматически"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill
            tone={
              profileMatch
                ? langameLinkStatusTone(profileMatch.linkStatus)
                : isCheckingLangame
                  ? "cyan"
                  : "amber"
            }
          >
            {profileMatch
              ? langameLinkStatusLabel(profileMatch.linkStatus)
              : isCheckingLangame
                ? "автосверка"
                : "ожидает проверки"}
          </StatusPill>
          {localGameMatch && !langameMatch ? (
            <StatusPill tone="cyan">клубная автосверка</StatusPill>
          ) : null}
          {langameMatch ? (
            <>
              <StatusPill tone={langameResultsCount > 0 ? "cyan" : "amber"}>
                {formatNumber(langameResultsCount)} совпадений
              </StatusPill>
              {langameSources.length > 0 ? (
                <StatusPill tone="cyan">
                  {formatNumber(langameSources.length)} источников
                </StatusPill>
              ) : null}
            </>
          ) : null}
        </div>
        {profileMatch ? (
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {profileMatch.nextAction}
          </p>
        ) : null}
        {!canCheckLangameMatch && localGameMatch ? (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Полный номер не возвращается в браузер. Клубная сверка выполняется
            сервером один раз по подтвержденному телефону.
          </p>
        ) : null}
        {hasBackfilled && backfilled ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Metric label="Награды" value={backfilled.rewards} />
            <Metric label="События" value={backfilled.events} />
            <Metric label="Доставки" value={backfilled.deliveries} />
            <Metric label="Ledger" value={backfilled.bonusLedgerEntries} />
          </div>
        ) : null}
        {langameSources.length > 0 ? (
          <div className="mt-3 space-y-2">
            {langameSources.slice(0, 3).map((source) => {
              const knownLocal = source.results.filter(
                (result) => result.localGuestKnown,
              ).length;

              return (
                <div
                  className="rounded-lg border border-white/10 bg-[#070b12] px-3 py-2"
                  key={source.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {source.name || source.domain}
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                        {source.domain}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-black text-slate-200">
                      {langameSourceStatusLabel(source.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {formatNumber(source.resultsCount)} найдено в Langame
                    {knownLocal > 0
                      ? `, ${formatNumber(knownLocal)} уже есть в snapshot LeetPlus`
                      : ""}
                    {source.errorMessage ? `, ${source.errorMessage}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {nextActions.length > 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-bold uppercase text-slate-400">
            Ближайшие действия
          </p>
          <div className="mt-3 space-y-2">
            {nextActions.map((action) => (
              <div
                className="rounded-lg border border-white/10 bg-[#070b12] p-3"
                key={action.id}
              >
                <p className="font-bold text-white">{action.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {action.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Link
        className="flex min-h-11 items-center justify-center rounded-lg bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200"
        href={continueHref}
      >
        Продолжить
      </Link>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="truncate text-[11px] font-bold uppercase text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-black text-white">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
    </div>
  );
}

function StatusPill({
  tone,
  children,
  className = "",
}: {
  tone: "emerald" | "cyan" | "amber";
  children: ReactNode;
  className?: string;
}) {
  const classes = {
    emerald: "bg-emerald-300/10 text-emerald-100",
    cyan: "bg-cyan-300/10 text-cyan-100",
    amber: "bg-amber-300/10 text-amber-100",
  } satisfies Record<"emerald" | "cyan" | "amber", string>;

  return (
    <span
      className={`rounded-lg px-3 py-1 text-xs font-black ${classes[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

function GameAuthNodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 3v6" />
      <path d="M12 15v6" />
      <path d="M5.6 6.2l4.2 4.2" />
      <path d="M14.2 13.6l4.2 4.2" />
      <path d="M21 12h-6" />
      <path d="M9 12H3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function VerificationChannelIcon({
  channel,
}: {
  channel: GuestPortalVerificationChannel;
}) {
  if (channel === "TELEGRAM_BOT") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 4 3.8 10.6c-.7.3-.7 1.3.1 1.5l4.6 1.3 1.7 5.2c.2.7 1.1.9 1.6.3l2.6-3.1 4.7 3.4c.6.4 1.4.1 1.5-.7L22 5c.1-.7-.4-1.2-1-.9Z" />
        <path d="m8.6 13.4 8.1-5.1" />
      </svg>
    );
  }

  if (channel === "USER_CALL" || channel === "INCOMING_CALL_LAST4") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M7.2 4.8 9.4 7c.5.5.6 1.2.3 1.8l-.8 1.5a11.2 11.2 0 0 0 4.8 4.8l1.5-.8c.6-.3 1.3-.2 1.8.3l2.2 2.2c.6.6.6 1.6 0 2.2l-1 1c-.6.6-1.5.8-2.3.5C10.2 18.6 5.4 13.8 3.5 8.1c-.3-.8-.1-1.7.5-2.3l1-1c.6-.6 1.6-.6 2.2 0Z" />
        <path d="M15 5.5a4 4 0 0 1 3.5 3.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
      <path d="M8 11h.01" />
      <path d="M12 11h.01" />
      <path d="M16 11h.01" />
    </svg>
  );
}

function gameAuthMethodTitle(
  channel: GuestPortalVerificationChannel,
  fallback: string,
) {
  if (channel === "TELEGRAM_BOT") {
    return "Telegram-бот";
  }

  if (channel === "USER_CALL") {
    return "Звонок на бесплатный номер";
  }

  if (channel === "SMS_CODE") {
    return "SMS-код";
  }

  return fallback;
}

function gameAuthMethodCopy(
  option: GuestPortalGamificationClubDirectory["verification"]["options"][number],
) {
  if (option.channel === "TELEGRAM_BOT") {
    return option.botUsername
      ? `Подтверждение в боте @${option.botUsername}`
      : "Подтверждение в боте";
  }

  if (option.channel === "USER_CALL") {
    return option.freeCall
      ? "Бесплатный звонок для подтверждения"
      : "Подтверждение через звонок";
  }

  if (option.channel === "SMS_CODE") {
    return "Короткий код на номер";
  }

  return option.message;
}

function gameAuthMethodSummary(channel: GuestPortalVerificationChannel) {
  if (channel === "TELEGRAM_BOT") {
    return "Подтвердите вход через Telegram-бота и вернитесь к игровому модулю.";
  }

  if (channel === "USER_CALL") {
    return "Введите номер, позвоните на бесплатный номер и подтвердите вход в игровой модуль.";
  }

  if (channel === "SMS_CODE") {
    return "Введите номер телефона и код из SMS для безопасного входа.";
  }

  return "Выберите доступный способ подтверждения игрового профиля.";
}

function clubApiPath(club: GuestPortalGamificationClub) {
  const storeSlug = club.store.publicSlug ?? club.store.id;

  return `/api/guest-portal/${encodeURIComponent(
    club.tenant.slug,
  )}/${encodeURIComponent(storeSlug)}`;
}

function resolveInitialClubId(
  clubs: GuestPortalGamificationClub[],
  initialClubId: string | null,
  initialStoreId: string | null,
) {
  const clubId = normalizedIdParam(initialClubId);
  const storeId = normalizedIdParam(initialStoreId);

  if (clubId) {
    const directClub = clubs.find((club) => club.id === clubId);

    if (directClub) {
      return directClub.id;
    }
  }

  if (storeId) {
    const storeClub = clubs.find(
      (club) =>
        club.store.id === storeId ||
        club.store.publicSlug === storeId ||
        club.id === `${club.tenant.slug}:${storeId}`,
    );

    if (storeClub) {
      return storeClub.id;
    }
  }

  return clubs[0]?.id ?? "";
}

function resolveInitialVerificationChannel(
  verification: GuestPortalGamificationClubDirectory["verification"],
): GuestPortalVerificationChannel {
  const options = verification.options
    .slice()
    .sort((left, right) => left.rank - right.rank);
  const recommendedReady = options.find(
    (option) =>
      option.channel === verification.recommendedChannel &&
      option.status === "READY",
  );

  if (recommendedReady) {
    return recommendedReady.channel;
  }

  return (
    options.find((option) => option.status === "READY")?.channel ??
    verification.recommendedChannel
  );
}

function getVisibleVerificationPlan(
  verification: GuestPortalGamificationClubDirectory["verification"],
  surface: PlayRegistrationSurface,
): GuestPortalGamificationClubDirectory["verification"] {
  const options = verification.options.filter((option) => {
    if (HIDDEN_PUBLIC_VERIFICATION_CHANNELS.has(option.channel)) {
      return false;
    }

    if (surface === "game-auth") {
      return GAME_AUTH_VERIFICATION_CHANNELS.has(option.channel);
    }

    return true;
  });
  const recommendedChannel =
    options.find((option) => option.channel === verification.recommendedChannel)
      ?.channel ??
    options.slice().sort((left, right) => left.rank - right.rank)[0]
      ?.channel ??
    "TELEGRAM_BOT";

  return {
    ...verification,
    recommendedChannel,
    options,
  };
}

function normalizedIdParam(value: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeGuestPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("8")) {
    return `7${digits.slice(1, 11)}`;
  }

  if (digits.startsWith("7")) {
    return digits.slice(0, 11);
  }

  return `7${digits.slice(0, 10)}`;
}

function formatGuestPhoneInputValue(value: string) {
  const digits = normalizeGuestPhoneDigits(value);

  if (!digits) {
    return "";
  }

  const localDigits = digits.slice(1);
  let formatted = "+7";

  if (localDigits.length > 0) {
    formatted += ` ${localDigits.slice(0, 3)}`;
  }

  if (localDigits.length > 3) {
    formatted += ` ${localDigits.slice(3, 6)}`;
  }

  if (localDigits.length > 6) {
    formatted += `-${localDigits.slice(6, 8)}`;
  }

  if (localDigits.length > 8) {
    formatted += `-${localDigits.slice(8, 10)}`;
  }

  return formatted;
}

function normalizeGuestPhoneForSubmit(value: string) {
  const digits = normalizeGuestPhoneDigits(value);

  return digits.length === 11 ? `+${digits}` : null;
}

function openTelegramDeepLink(botDeepLink: string | null) {
  if (!botDeepLink || typeof window === "undefined") {
    return;
  }

  const popup = window.open(botDeepLink, "_blank");

  if (!popup) {
    window.location.href = botDeepLink;
  }
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(
    value,
  );
}

function buildMapViewport(
  points: Array<{ latitude: number; longitude: number }>,
): MapViewport | null {
  if (points.length === 0) {
    return null;
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  let minLatitude = Math.min(...latitudes);
  let maxLatitude = Math.max(...latitudes);
  let minLongitude = Math.min(...longitudes);
  let maxLongitude = Math.max(...longitudes);

  if (minLatitude === maxLatitude) {
    minLatitude -= 0.01;
    maxLatitude += 0.01;
  }

  if (minLongitude === maxLongitude) {
    minLongitude -= 0.01;
    maxLongitude += 0.01;
  }

  const latitudePadding = (maxLatitude - minLatitude) * 0.12;
  const longitudePadding = (maxLongitude - minLongitude) * 0.12;

  return {
    minLatitude: minLatitude - latitudePadding,
    maxLatitude: maxLatitude + latitudePadding,
    minLongitude: minLongitude - longitudePadding,
    maxLongitude: maxLongitude + longitudePadding,
  };
}

function mapPointStyle(
  point: { latitude: number; longitude: number },
  viewport: MapViewport,
  index = 0,
) {
  const longitudeRange = viewport.maxLongitude - viewport.minLongitude;
  const latitudeRange = viewport.maxLatitude - viewport.minLatitude;
  const x =
    ((point.longitude - viewport.minLongitude) / longitudeRange) * 100 +
    mapMarkerOffset(index, "x");
  const y =
    (1 - (point.latitude - viewport.minLatitude) / latitudeRange) * 100 +
    mapMarkerOffset(index, "y");

  return {
    left: `${clamp(x, 6, 94)}%`,
    top: `${clamp(y, 6, 94)}%`,
  };
}

function mapMarkerOffset(index: number, axis: "x" | "y") {
  const offsets = [
    { x: 0, y: 0 },
    { x: 1.4, y: -1.4 },
    { x: -1.4, y: 1.4 },
    { x: 1.4, y: 1.4 },
    { x: -1.4, y: -1.4 },
  ];
  const offset = offsets[index % offsets.length];

  return offset[axis];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function radiusOptionLabel(value: RadiusOption) {
  return value === null ? "Все" : `${formatNumber(value)} км`;
}

function radiusSearchMessage(directory: GuestPortalGamificationClubDirectory) {
  const radius = directory.search.radiusKm ?? 0;
  const hidden = directory.search.hiddenWithoutCoordinates;
  const hiddenText =
    hidden > 0 ? ` ${formatNumber(hidden)} клубов без координат скрыты.` : "";

  return `Показаны ${formatNumber(directory.total)} из ${formatNumber(
    directory.search.totalBeforeRadius,
  )} клубов в радиусе ${formatNumber(radius)} км.${hiddenText}`;
}

function verificationStatusTone(
  status: VerificationStatus,
): "emerald" | "cyan" | "amber" {
  if (status === "READY") {
    return "emerald";
  }

  if (status === "READY_AFTER_OTP") {
    return "cyan";
  }

  return "amber";
}

function telegramAuthStatusLabel(
  status: GuestPortalTelegramAuthStatusResponse["status"],
) {
  const labels = {
    PENDING: "Ожидаем Telegram",
    AWAITING_CONTACT: "Ожидаем телефон",
    CONFIRMED: "Телефон подтвержден",
    EXPIRED: "Ссылка истекла",
    FAILED: "Вход не завершен",
  } satisfies Record<GuestPortalTelegramAuthStatusResponse["status"], string>;

  return labels[status];
}

function userCallAuthStatusLabel(
  status: GuestPortalUserCallAuthStatusResponse["status"],
) {
  const labels = {
    PENDING: "Ожидаем звонок",
    CONFIRMED: "Подтверждено",
    EXPIRED: "Ожидание истекло",
    FAILED: "Вход не завершен",
  } satisfies Record<GuestPortalUserCallAuthStatusResponse["status"], string>;

  return labels[status];
}

function incomingCallLast4StatusLabel(
  status: GuestPortalIncomingCallLast4StartResponse["delivery"]["status"],
) {
  const labels = {
    DEV_CODE: "Demo-код звонка",
    SENT: "Звонок создан",
    NOT_CONFIGURED: "Канал не настроен",
    BLOCKED: "Звонок заблокирован",
    FAILED: "Звонок не создан",
  } satisfies Record<
    GuestPortalIncomingCallLast4StartResponse["delivery"]["status"],
    string
  >;

  return labels[status];
}

async function readMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: unknown };
    return typeof data.message === "string" ? data.message : "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
}

function normalizeReferralCode(value: string | null) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  const code = normalized.slice(0, 80);

  if (!/^lp_ref_[A-Za-z0-9_-]{16,64}$/.test(code)) {
    return null;
  }

  return code;
}

function otpDeliveryStatusLabel(
  status: GuestPortalOtpStartResponse["delivery"]["status"],
) {
  const labels = {
    DEV_CODE: "Код готов",
    SENT: "Код отправлен",
    NOT_CONFIGURED: "Доставка не настроена",
    BLOCKED: "Доставка заблокирована",
    FAILED: "Ошибка отправки",
  } satisfies Record<GuestPortalOtpStartResponse["delivery"]["status"], string>;

  return labels[status];
}

function langameMatchStatusLabel(
  status: GuestPortalLangameMatchResponse["status"],
) {
  const labels = {
    MATCHED_LOCAL: "Гость найден в LeetPlus",
    FOUND_IN_LANGAME: "Гость найден в Langame",
    NOT_FOUND: "Гость не найден",
    FAILED: "Проверка не выполнена",
  } satisfies Record<GuestPortalLangameMatchResponse["status"], string>;

  return labels[status];
}

function localGameMatchStatusLabel(
  status: GuestPortalLocalGameProfileMatch["status"],
) {
  const labels = {
    MATCHED_LOCAL: "Гость найден в LeetPlus",
    FOUND_IN_LANGAME: "Гость найден в Langame",
    WAITING_FOR_SYNC: "Клубная сверка",
    CONFLICT: "Нужна проверка",
    NOT_FOUND: "Гость не найден в клубе",
    FAILED: "Сверка недоступна",
    NOT_LINKED: "Профиль отдельный",
  } satisfies Record<GuestPortalLocalGameProfileMatch["status"], string>;

  return labels[status];
}

function langameLinkStatusLabel(
  status: GuestPortalLangameMatchResponse["linkStatus"],
) {
  const labels = {
    LINKED: "профиль связан",
    ALREADY_LINKED: "уже связан",
    WAITING_FOR_SYNC: "сверка сохранена",
    CONFLICT: "нужна проверка",
    NOT_LINKED: "не связан",
  } satisfies Record<GuestPortalLangameMatchResponse["linkStatus"], string>;

  return labels[status];
}

function langameLinkStatusTone(
  status: GuestPortalLangameMatchResponse["linkStatus"],
): "emerald" | "cyan" | "amber" {
  if (status === "LINKED" || status === "ALREADY_LINKED") {
    return "emerald";
  }

  if (status === "WAITING_FOR_SYNC") {
    return "cyan";
  }

  return "amber";
}

function langameSourceStatusLabel(
  status: GuestPortalLangameMatchResponse["sources"][number]["status"],
) {
  return status === "SUCCESS" ? "ok" : "ошибка";
}

function countLangameResults(
  match: GuestPortalLangameMatchResponse | null,
) {
  return (
    match?.sources.reduce((total, source) => total + source.resultsCount, 0) ??
    0
  );
}

function hasBackfilledGameItems(
  backfilled: GuestPortalLangameMatchResponse["backfilled"] | null,
) {
  if (!backfilled) {
    return false;
  }

  return (
    backfilled.rewards > 0 ||
    backfilled.events > 0 ||
    backfilled.deliveries > 0 ||
    backfilled.bonusLedgerEntries > 0
  );
}

const gameAuthCss = `
.lp-game-auth-page {
  position: relative;
  min-width: 320px;
  isolation: isolate;
  overflow-x: hidden;
  letter-spacing: 0;
}

.lp-game-auth-page,
.lp-game-auth-page *,
.lp-game-auth-page *::before,
.lp-game-auth-page *::after {
  box-sizing: border-box;
}

.lp-game-auth-page button,
.lp-game-auth-page input {
  font: inherit;
}

.lp-game-auth-shell {
  position: relative;
  z-index: 1;
}

.lp-game-auth-legal {
  position: relative;
  z-index: 1;
  margin-top: auto;
  padding: 18px 0 4px;
  border-top-color: rgba(196, 224, 225, 0.16) !important;
  color: rgba(168, 185, 186, 0.78) !important;
}

.lp-game-auth-legal > div {
  justify-content: center;
}

.lp-game-auth-legal p,
.lp-game-auth-legal dt,
.lp-game-auth-legal dd {
  color: rgba(168, 185, 186, 0.78) !important;
}

.lp-game-auth-legal p {
  color: rgba(237, 247, 248, 0.78) !important;
}

.lp-game-auth-page::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 11%, rgba(140, 230, 237, 0.035) 11% 11.08%, transparent 11.08% 100%),
    linear-gradient(90deg, transparent 0 54%, rgba(140, 230, 237, 0.035) 54% 54.06%, transparent 54.06% 100%),
    radial-gradient(circle at 78% 22%, rgba(140, 230, 237, 0.065), transparent 24%),
    radial-gradient(circle at 18% 68%, rgba(208, 170, 108, 0.035), transparent 22%);
}

.lp-game-auth-backdrop,
.lp-game-auth-veil,
.lp-game-auth-scan {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.lp-game-auth-backdrop {
  z-index: -4;
  background: #000;
}

.lp-game-auth-veil {
  z-index: -3;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0.48) 48%, rgba(0, 0, 0, 0.74)),
    linear-gradient(180deg, rgba(0, 0, 0, 0.32), rgba(0, 0, 0, 0.72));
}

.lp-game-auth-scan {
  z-index: -2;
  opacity: 0.26;
  background-image:
    linear-gradient(rgba(160, 223, 225, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(160, 223, 225, 0.035) 1px, transparent 1px);
  background-size: 92px 92px;
  mask-image:
    linear-gradient(90deg, rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0.9) 52%, rgba(0, 0, 0, 0.28)),
    linear-gradient(180deg, transparent, #000 16%, #000 84%, transparent);
}

.lp-game-auth-topbar {
  border-bottom: 0 !important;
  padding-top: 0;
  padding-bottom: 0;
}

.lp-game-auth-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 6px;
  background: rgba(7, 12, 16, 0.72);
  color: #a9babc;
  font-size: 11px;
  font-weight: 780;
  text-transform: uppercase;
}

.lp-game-auth-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #83e4ec;
  box-shadow: 0 0 16px rgba(131, 228, 236, 0.8);
}

.lp-game-auth-brand-mark {
  position: relative;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid rgba(186, 236, 238, 0.42);
  border-radius: 50%;
  box-shadow: inset 0 0 18px rgba(140, 230, 237, 0.12);
}

.lp-game-auth-brand-mark::before,
.lp-game-auth-brand-mark::after {
  content: "";
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(140, 230, 237, 0.36);
  transform: rotate(45deg);
}

.lp-game-auth-brand-mark::after {
  inset: 14px;
  border-color: #d0aa6c;
}

.lp-game-auth-flow {
  align-content: start;
}

.lp-game-auth-intro {
  max-width: 570px;
  padding-top: 4vh;
}

.lp-game-auth-chapter {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
  color: #9eb3b6;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 11px;
  font-weight: 720;
}

.lp-game-auth-chapter::before {
  content: "";
  height: 1px;
  background: linear-gradient(90deg, #8ce6ed, transparent);
}

.lp-game-auth-intro h2 {
  max-width: 560px;
  margin: 0;
  color: #edf7f8;
  font-size: clamp(42px, 6vw, 78px);
  line-height: 0.96;
  font-weight: 640;
  letter-spacing: 0;
}

.lp-game-auth-intro p {
  max-width: 470px;
  margin: 24px 0 0;
  color: #b6c7c9;
  font-size: clamp(16px, 1.8vw, 18px);
  line-height: 1.7;
}

.lp-game-auth-rank-strip {
  width: min(480px, 100%);
  margin-top: 42px;
  border-top: 1px solid rgba(183, 224, 228, 0.28);
  border-bottom: 1px solid rgba(183, 224, 228, 0.16);
  background: linear-gradient(90deg, rgba(9, 20, 25, 0.72), rgba(9, 20, 25, 0.2));
  backdrop-filter: blur(10px);
}

.lp-game-auth-rank-strip > div {
  display: grid;
  grid-template-columns: 90px 1fr 72px;
  gap: 18px;
  align-items: center;
  padding: 16px 0;
}

.lp-game-auth-rank-strip span:first-child,
.lp-game-auth-rank-strip span:last-child {
  color: #8ce6ed;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 11px;
  font-weight: 760;
}

.lp-game-auth-rank-strip span:last-child {
  text-align: right;
  color: #d0aa6c;
}

.lp-game-auth-rank-strip span:nth-child(2) {
  position: relative;
  height: 3px;
  background: rgba(183, 224, 228, 0.18);
  overflow: hidden;
}

.lp-game-auth-rank-strip span:nth-child(2)::before {
  content: "";
  position: absolute;
  inset: 0 42% 0 0;
  background: linear-gradient(90deg, #8ce6ed, #d0aa6c);
  box-shadow: 0 0 18px rgba(140, 230, 237, 0.52);
}

.lp-game-auth-panel {
  position: relative;
  border-color: rgba(183, 224, 228, 0.22) !important;
  border-radius: 8px !important;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 28%),
    linear-gradient(180deg, rgba(10, 18, 22, 0.94), rgba(4, 8, 11, 0.94)) !important;
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.46) !important;
  backdrop-filter: blur(26px);
}

.lp-game-auth-panel::before,
.lp-game-auth-panel::after {
  content: "";
  position: absolute;
  width: 42px;
  height: 42px;
  pointer-events: none;
}

.lp-game-auth-panel::before {
  top: -1px;
  left: -1px;
  border-top: 1px solid #8ce6ed;
  border-left: 1px solid #8ce6ed;
  border-top-left-radius: 8px;
}

.lp-game-auth-panel::after {
  right: -1px;
  bottom: -1px;
  border-right: 1px solid #d0aa6c;
  border-bottom: 1px solid #d0aa6c;
  border-bottom-right-radius: 8px;
}

.lp-game-auth-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.13);
}

.lp-game-auth-panel-title {
  display: block;
  color: #edf7f8;
  font-size: 24px;
  line-height: 1.08;
  font-weight: 730;
}

.lp-game-auth-panel-copy {
  display: block;
  margin-top: 8px;
  color: #a9babc;
  font-size: 13px;
  line-height: 1.52;
}

.lp-game-auth-node {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: 50%;
  color: #83e4ec;
  background: rgba(131, 228, 236, 0.06);
}

.lp-game-auth-node svg,
.lp-game-auth-method svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.8;
}

.lp-game-auth-method-stack {
  display: grid;
  gap: 10px;
}

.lp-game-auth-method {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: 74px;
  padding: 12px 13px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  background: rgba(3, 9, 12, 0.68);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-game-auth-method:focus-visible,
.lp-game-auth-method:hover {
  outline: none;
  border-color: rgba(131, 228, 236, 0.44);
  background: rgba(12, 22, 26, 0.86);
}

.lp-game-auth-method.is-selected {
  border-color: rgba(131, 228, 236, 0.72);
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.14), transparent),
    rgba(10, 21, 25, 0.92);
}

.lp-game-auth-method.is-selected::before {
  content: "";
  position: absolute;
  inset: 12px auto 12px -1px;
  width: 2px;
  background: #83e4ec;
  box-shadow: 0 0 16px rgba(131, 228, 236, 0.75);
}

.lp-game-auth-method-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 7px;
  color: #83e4ec;
  background: rgba(196, 224, 225, 0.045);
}

.lp-game-auth-method-text {
  min-width: 0;
}

.lp-game-auth-method-title {
  display: block;
  color: #edf7f8;
  font-size: 14px;
  font-weight: 760;
  line-height: 1.2;
}

.lp-game-auth-method-copy {
  display: block;
  margin-top: 5px;
  color: #a9babc;
  font-size: 12px;
  line-height: 1.35;
}

.lp-game-auth-method-state {
  color: #71878a;
  font-size: 10px;
  font-weight: 820;
  text-transform: uppercase;
}

.lp-game-auth-method.is-selected .lp-game-auth-method-state {
  color: #83e4ec;
}

.lp-game-auth-channel-detail {
  position: relative;
  overflow: hidden;
  border-color: rgba(196, 224, 225, 0.16) !important;
  border-radius: 7px !important;
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.08), transparent 62%),
    rgba(3, 9, 12, 0.72) !important;
  box-shadow: none !important;
}

.lp-game-auth-channel-detail::before {
  content: "";
  position: absolute;
  inset: 12px auto 12px -1px;
  width: 2px;
  background: #83e4ec;
  box-shadow: 0 0 16px rgba(131, 228, 236, 0.72);
}

.lp-game-auth-channel-detail::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.035), transparent 36%);
}

.lp-game-auth-channel-detail > * {
  position: relative;
  z-index: 1;
}

.lp-game-auth-channel-kicker {
  color: #83e4ec !important;
  letter-spacing: 0 !important;
  font-size: 10px !important;
  font-weight: 820 !important;
}

.lp-game-auth-channel-title {
  color: #edf7f8 !important;
  font-size: 16px !important;
  line-height: 1.2 !important;
  font-weight: 760 !important;
}

.lp-game-auth-channel-pill {
  border: 1px solid rgba(208, 170, 108, 0.22) !important;
  border-radius: 6px !important;
  background: rgba(208, 170, 108, 0.1) !important;
  color: #d8c08f !important;
  letter-spacing: 0 !important;
  font-size: 10px !important;
  text-transform: uppercase;
}

.lp-game-auth-channel-primary,
.lp-game-auth-channel-secondary {
  border-radius: 7px !important;
  min-height: 44px;
}

.lp-game-auth-channel-primary {
  border: 1px solid rgba(131, 228, 236, 0.36) !important;
  background: rgba(131, 228, 236, 0.13) !important;
  color: #dffcff !important;
}

.lp-game-auth-channel-primary:hover:not(:disabled) {
  border-color: rgba(131, 228, 236, 0.58) !important;
  background: rgba(131, 228, 236, 0.19) !important;
}

.lp-game-auth-channel-secondary,
.lp-game-auth-call-action {
  border-color: rgba(196, 224, 225, 0.14) !important;
  background: rgba(196, 224, 225, 0.04) !important;
  color: #71878a !important;
}

.lp-game-auth-channel-secondary:hover:not(:disabled) {
  border-color: rgba(131, 228, 236, 0.36) !important;
  color: #cceef1 !important;
}

.lp-game-auth-call-action {
  border-color: rgba(131, 228, 236, 0.74) !important;
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.32), rgba(169, 228, 199, 0.18)),
    rgba(131, 228, 236, 0.12) !important;
  color: #effdff !important;
  box-shadow: 0 0 0 1px rgba(131, 228, 236, 0.16), 0 0 26px rgba(131, 228, 236, 0.16);
}

.lp-game-auth-call-action:hover {
  border-color: rgba(131, 228, 236, 0.95) !important;
  background:
    linear-gradient(90deg, rgba(131, 228, 236, 0.42), rgba(169, 228, 199, 0.24)),
    rgba(131, 228, 236, 0.16) !important;
}

.lp-game-auth-channel-meta,
.lp-game-auth-channel-note {
  color: #9eb3b6 !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
}

@media (min-width: 1024px) {
  .lp-game-auth-flow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 436px;
    align-items: start;
    gap: clamp(32px, 5vw, 92px);
    padding-top: 6rem;
  }

  .lp-game-auth-intro-slot {
    grid-column: 1;
    grid-row: 1;
  }

  .lp-game-auth-panel {
    grid-column: 2;
    grid-row: 1;
  }
}

@media (max-width: 900px) {
  .lp-game-auth-intro {
    max-width: none;
    padding-top: 0;
  }

  .lp-game-auth-intro h2 {
    max-width: 500px;
  }

  .lp-game-auth-intro p {
    max-width: 520px;
    margin-top: 18px;
  }

  .lp-game-auth-rank-strip {
    margin-top: 28px;
  }
}

@media (max-width: 640px) {
  .lp-game-auth-page {
    background:
      radial-gradient(circle at 88% 16%, rgba(131, 228, 236, 0.1), transparent 25%),
      radial-gradient(circle at 12% 72%, rgba(208, 170, 108, 0.04), transparent 24%),
      #000 !important;
  }

  .lp-game-auth-scan {
    opacity: 0.55;
    background-size: 72px 72px;
    mask-image: linear-gradient(180deg, #000, #000 74%, transparent);
  }

  .lp-game-auth-shell {
    max-width: none;
    padding: 0;
  }

  .lp-game-auth-topbar {
    position: sticky;
    top: 0;
    z-index: 4;
    flex-wrap: nowrap;
    min-height: 70px;
    padding: 16px 14px 12px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.94), rgba(0, 0, 0, 0.7), transparent);
    backdrop-filter: blur(12px);
  }

  .lp-game-auth-header-eyebrow,
  .lp-game-auth-nav-link {
    display: none;
  }

  .lp-game-auth-header-title {
    color: #edf7f8;
    font-size: 12px !important;
    font-weight: 820;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .lp-game-auth-header-actions {
    flex: 0 0 auto;
  }

  .lp-game-auth-status {
    max-width: 120px;
    overflow: hidden;
  }

  .lp-game-auth-flow {
    display: flex;
    width: min(100% - 24px, 430px);
    margin: 0 auto;
    flex-direction: column;
    gap: 0;
    padding: 16px 0 30px;
  }

  .lp-game-auth-intro-slot {
    order: 1;
  }

  .lp-game-auth-panel {
    order: 2;
  }

  .lp-game-auth-intro {
    padding: 10px 0 18px;
  }

  .lp-game-auth-chapter {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    letter-spacing: 0;
  }

  .lp-game-auth-chapter::before {
    width: 40px;
    flex: 0 0 auto;
  }

  .lp-game-auth-intro h2 {
    max-width: 360px;
    font-size: 40px;
    line-height: 0.98;
    font-weight: 730;
  }

  .lp-game-auth-intro p {
    max-width: 360px;
    margin-top: 18px;
    color: #c2d0d1;
    font-size: 16px;
    line-height: 1.62;
  }

  .lp-game-auth-rank-strip {
    display: none;
  }

  .lp-game-auth-panel {
    margin-top: 8px;
    padding: 20px 18px 18px !important;
    box-shadow: 0 28px 84px rgba(0, 0, 0, 0.52) !important;
  }

  .lp-game-auth-method-state {
    justify-self: end;
  }

  .lp-game-auth-consent {
    color: #a9babc !important;
    font-size: 12px;
    line-height: 1.45;
  }

  .lp-game-auth-phone-form input {
    min-height: 52px;
    border-color: rgba(196, 224, 225, 0.16);
    border-radius: 7px;
    background: rgba(0, 6, 9, 0.7);
    color: #edf7f8;
    font-size: 15px;
  }

  .lp-game-auth-search-card,
  .lp-game-auth-map-slot > div,
  .lp-game-auth-club-list > button,
  .lp-game-auth-club-list > div {
    border-color: rgba(196, 224, 225, 0.14) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent 28%),
      rgba(8, 14, 18, 0.88) !important;
  }

  .lp-game-auth-map-slot {
    display: none;
  }

  .lp-game-auth-club-list {
    max-height: 360px;
    overflow-y: auto;
    padding-right: 2px;
  }
}

@media (max-width: 560px) {
  .lp-game-auth-brand-mark {
    width: 30px;
    height: 30px;
  }

  .lp-game-auth-chapter {
    margin-bottom: 18px;
  }

  .lp-game-auth-intro h2 {
    font-size: clamp(36px, 11vw, 48px);
  }

  .lp-game-auth-rank-strip > div {
    grid-template-columns: 74px 1fr 54px;
    gap: 12px;
  }
}
`;
