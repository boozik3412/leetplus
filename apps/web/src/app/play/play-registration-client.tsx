"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  GuestPortalGamificationClub,
  GuestPortalGamificationClubDirectory,
  GuestPortalGameSummary,
  GuestPortalLangameMatchResponse,
  GuestPortalOtpStartResponse,
  GuestPortalOtpVerifyResponse,
  GuestPortalPayload,
} from "@/lib/guest-portal";

type PlayRegistrationClientProps = {
  initialDirectory: GuestPortalGamificationClubDirectory;
  loadError: string | null;
};

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

export function PlayRegistrationClient({
  initialDirectory,
  loadError,
}: PlayRegistrationClientProps) {
  const [directory, setDirectory] = useState(initialDirectory);
  const [query, setQuery] = useState("");
  const [locationCoords, setLocationCoords] = useState<PlayLocation | null>(
    null,
  );
  const [radiusKm, setRadiusKm] = useState<RadiusOption>(null);
  const [selectedClubId, setSelectedClubId] = useState(
    initialDirectory.clubs[0]?.id ?? "",
  );
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] =
    useState<GuestPortalOtpStartResponse | null>(null);
  const [portal, setPortal] = useState<GuestPortalPayload | null>(null);
  const [langameMatch, setLangameMatch] =
    useState<GuestPortalLangameMatchResponse | null>(null);
  const [activeSummary, setActiveSummary] =
    useState<GuestPortalGameSummary | null>(null);
  const [activeSessionState, setActiveSessionState] =
    useState<ActiveSessionState>("loading");
  const [activeSessionMessage, setActiveSessionMessage] = useState<
    string | null
  >(null);
  const [gameConsentAccepted, setGameConsentAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(loadError);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [isLocating, setLocating] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isCheckingLangame, setCheckingLangame] = useState(false);

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
  const canEnterOtpCode =
    challenge?.delivery.status === "DEV_CODE" ||
    challenge?.delivery.status === "SENT";

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
          setActiveSessionState("empty");
          setActiveSummary(null);
          setActiveSessionMessage(null);
          return;
        }

        if (!response.ok) {
          throw new Error(await readMessage(response));
        }

        setActiveSummary((await response.json()) as GuestPortalGameSummary);
        setActiveSessionState("ready");
        setActiveSessionMessage(null);
      } catch (error) {
        if (!isActive) {
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
  }, []);

  function selectClub(club: GuestPortalGamificationClub) {
    setSelectedClubId(club.id);
    setChallenge(null);
    setCode("");
    setPortal(null);
    setLangameMatch(null);
    setMessage(null);
  }

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

    setSubmitting(true);
    setMessage(null);
    setChallenge(null);
    setCode("");
    setPortal(null);
    setLangameMatch(null);

    try {
      const response = await fetch(`${clubApiPath(selectedClub)}/otp/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, gameConsentAccepted }),
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
        }),
      });

      if (!response.ok) {
        throw new Error(await readMessage(response));
      }

      const data = (await response.json()) as GuestPortalOtpVerifyResponse;
      setPortal(data.portal);
      setMessage("Телефон подтвержден. Гостевой профиль готов.");
      await checkLangameMatch();
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

  async function checkLangameMatch() {
    const phoneValue = phone.trim();

    if (!phoneValue) {
      setMessage("Введите подтвержденный телефон.");
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
  }

  return (
    <main className="min-h-screen bg-[#05080d] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-300/[0.12] text-sm font-black text-emerald-100">
              LP
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-emerald-300">
                LeetPlus Play
              </p>
              <h1 className="truncate text-xl font-black text-white sm:text-2xl">
                Квесты и бонусы клубов
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              className="rounded-lg border border-white/10 px-3 py-2 font-bold text-slate-200 transition hover:border-white/25 hover:bg-white/[0.06]"
              href="/login"
            >
              Вход для команды
            </Link>
          </div>
        </header>

        <ActiveGameSessionPanel
          message={activeSessionMessage}
          state={activeSessionState}
          summary={activeSummary}
        />

        <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_430px]">
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/20">
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

            <ClubMap
              clubs={visibleClubs}
              onSelectClub={selectClub}
              selectedClubId={selectedClub?.id ?? ""}
              userLocation={locationCoords}
            />

            <div className="space-y-3">
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

          <aside className="rounded-lg border border-white/10 bg-[#0b111c] p-4 shadow-2xl shadow-black/25 sm:p-5">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase text-emerald-300">
                Регистрация участника
              </p>
              <h2 className="mt-1 text-2xl font-black text-white">
                Телефон и клуб
              </h2>
            </div>

            {selectedClub ? (
              <div className="space-y-5">
                <SelectedClubSummary club={selectedClub} />

                {portal ? (
                  <VerifiedSummary
                    club={selectedClub}
                    isCheckingLangame={isCheckingLangame}
                    langameMatch={langameMatch}
                    onCheckLangameMatch={() => void checkLangameMatch()}
                    portal={portal}
                  />
                ) : (
                  <div className="space-y-4">
                    <form className="space-y-3" onSubmit={submitPhone}>
                      <label className="block">
                        <span className="text-xs font-bold uppercase text-slate-400">
                          Мобильный телефон
                        </span>
                        <input
                          className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 text-base font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-300/70"
                          inputMode="tel"
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="+7 999 999-99-99"
                          value={phone}
                        />
                      </label>
                      <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-slate-300">
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
                      <button
                        className="min-h-11 w-full rounded-lg bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                          isSubmitting ||
                          !phone.trim() ||
                          !gameConsentAccepted
                        }
                        type="submit"
                      >
                        {isSubmitting ? "Отправляем..." : "Получить код"}
                      </button>
                    </form>

                    {challenge ? (
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
      </div>
    </main>
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

  const guestPortalHref = `/guest/${encodeURIComponent(
    summary.tenant.slug,
  )}/${encodeURIComponent(summary.store.publicSlug ?? summary.store.id)}`;

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
            href={guestPortalHref}
          >
            Кабинет клуба
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

function VerifiedSummary({
  club,
  portal,
  langameMatch,
  isCheckingLangame,
  onCheckLangameMatch,
}: {
  club: GuestPortalGamificationClub;
  portal: GuestPortalPayload;
  langameMatch: GuestPortalLangameMatchResponse | null;
  isCheckingLangame: boolean;
  onCheckLangameMatch: () => void;
}) {
  const nextActions = portal.gamification.nextActions.slice(0, 3);

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
              {langameMatch
                ? langameMatchStatusLabel(langameMatch.status)
                : "Проверка еще не выполнена"}
            </p>
          </div>
          <button
            className="rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-2 text-sm font-black text-cyan-100 transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCheckingLangame}
            onClick={onCheckLangameMatch}
            type="button"
          >
            {isCheckingLangame ? "Проверяем..." : "Проверить"}
          </button>
        </div>
        {langameMatch ? (
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {langameMatch.nextAction}
          </p>
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
        className="flex min-h-11 items-center justify-center rounded-lg border border-emerald-300/40 px-4 text-sm font-black text-emerald-100 transition hover:border-emerald-300"
        href="/play/game"
      >
        Открыть игру
      </Link>

      <Link
        className="flex min-h-11 items-center justify-center rounded-lg bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200"
        href={club.links.guestPortalPath}
      >
        Открыть кабинет клуба
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
}: {
  tone: "emerald" | "cyan" | "amber";
  children: ReactNode;
}) {
  const classes = {
    emerald: "bg-emerald-300/10 text-emerald-100",
    cyan: "bg-cyan-300/10 text-cyan-100",
    amber: "bg-amber-300/10 text-amber-100",
  } satisfies Record<"emerald" | "cyan" | "amber", string>;

  return (
    <span className={`rounded-lg px-3 py-1 text-xs font-black ${classes[tone]}`}>
      {children}
    </span>
  );
}

function clubApiPath(club: GuestPortalGamificationClub) {
  const storeSlug = club.store.publicSlug ?? club.store.id;

  return `/api/guest-portal/${encodeURIComponent(
    club.tenant.slug,
  )}/${encodeURIComponent(storeSlug)}`;
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

async function readMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: unknown };
    return typeof data.message === "string" ? data.message : "Ошибка запроса";
  } catch {
    return "Ошибка запроса";
  }
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
