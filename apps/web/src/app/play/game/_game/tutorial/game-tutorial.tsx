"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { loadGameAccountsEnabled } from "@/lib/guest-game-accounts";
import { markGameTutorialSeen } from "./api";
import { gameTutorialCss } from "./game-tutorial-css";
import {
  GAME_TUTORIAL_VERSION,
  gameTutorialStepsFor,
  type GameTutorialStep,
} from "./steps";

const AUTO_START_DELAY_MS = 700;
const SPOTLIGHT_PADDING = 8;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 12;
const SHEET_BREAKPOINT = 640;

type Rect = { top: number; left: number; width: number; height: number };

type CardMode = "center" | "sheet" | "float";

type Layout = {
  stepId: string;
  spot: Rect | null;
  mode: CardMode;
  style: CSSProperties;
};

/**
 * Tutorial state for the game screen. The tour starts by itself once, when
 * the profile has not seen the current version and nothing else is open, and
 * can be replayed from the menu. Finishing or skipping saves the version on
 * the guest profile; a failed save only means the tour may show again later.
 */
export function useGameTutorial({
  seenVersion,
  blocked,
}: {
  seenVersion: number | undefined;
  blocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dismissedRef = useRef(false);
  const savedRef = useRef(false);
  // An API without the field (older release) never auto-starts the tour.
  const needsTour =
    typeof seenVersion === "number" && seenVersion < GAME_TUTORIAL_VERSION;

  useEffect(() => {
    if (open || blocked || dismissedRef.current || !needsTour) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setOpen(true),
      AUTO_START_DELAY_MS,
    );

    return () => window.clearTimeout(timeoutId);
  }, [blocked, needsTour, open]);

  const start = useCallback(() => setOpen(true), []);

  const close = useCallback(() => {
    setOpen(false);
    dismissedRef.current = true;

    if (!needsTour || savedRef.current) {
      return;
    }

    savedRef.current = true;
    markGameTutorialSeen(GAME_TUTORIAL_VERSION).catch(() => {
      savedRef.current = false;
    });
  }, [needsTour]);

  return { open, start, close };
}

export function GameTutorial({
  clubName,
  onClose,
}: {
  clubName: string;
  onClose: () => void;
}) {
  // Steps and position change together when the game accounts step joins.
  const [tour, setTour] = useState(() => ({
    steps: availableSteps(false),
    index: 0,
  }));
  const { steps, index } = tour;
  const setIndex = useCallback(
    (update: (value: number) => number) =>
      setTour((current) => ({ ...current, index: update(current.index) })),
    [],
  );
  const [layout, setLayout] = useState<Layout | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const step = steps[index] ?? steps[0];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  // The game accounts step joins once the network answers that the feature
  // is on (usually long before the guest reaches it near the end).
  useEffect(() => {
    let active = true;

    void loadGameAccountsEnabled().then((enabled) => {
      if (!active || !enabled) {
        return;
      }

      const next = availableSteps(true);

      setTour((current) => {
        if (next.length === current.steps.length) {
          return current;
        }

        // Keep the guest on the step they are reading.
        const currentId = current.steps[current.index]?.id;
        const moved = next.findIndex((item) => item.id === currentId);
        return { steps: next, index: moved >= 0 ? moved : current.index };
      });
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;

    return () => {
      const target = returnFocusRef.current;

      if (!(target instanceof HTMLElement) || !target.isConnected) {
        return;
      }

      // Opened from the menu: the menu item is hidden again by now, so focus
      // goes back to the menu button.
      const fallback = target.closest(".lp-club-menu")
        ? document.querySelector<HTMLElement>(".lp-club-menu-button")
        : null;
      (fallback ?? target).focus({ preventScroll: true });
    };
  }, []);

  // Until the card of this step is measured it stays invisible, so it never
  // flashes at the previous step's position.
  const current = layout?.stepId === step?.id ? layout : null;
  const measured = current !== null;

  // Focus moves into the card once it is placed (an invisible card cannot
  // take focus), and again on every step.
  useEffect(() => {
    if (measured) {
      primaryRef.current?.focus({ preventScroll: true });
    }
  }, [index, measured]);

  // Bring the highlighted block into view below the sticky top bar.
  useEffect(() => {
    if (!step?.targets) {
      return;
    }

    const rect = unionRect(findTargets(step));

    if (!rect) {
      return;
    }

    const topbar = document.querySelector(".lp-club-topbar");
    const topOffset =
      (topbar?.getBoundingClientRect().height ?? 0) + VIEWPORT_MARGIN;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const fitsAbove =
      rect.height + topOffset + VIEWPORT_MARGIN < window.innerHeight * 0.55;
    const desiredTop = fitsAbove
      ? topOffset + VIEWPORT_MARGIN
      : topOffset + SPOTLIGHT_PADDING;

    window.scrollTo({
      top: Math.max(0, window.scrollY + rect.top - desiredTop),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [step]);

  // Follow the target while the page scrolls, resizes or re-renders, and
  // place the card next to it (or as a bottom sheet on narrow screens).
  useEffect(() => {
    if (!step) {
      return;
    }

    let frameId = 0;
    let previous = "";

    function track() {
      const rect = step.targets ? unionRect(findTargets(step)) : null;
      const cardHeight = cardRef.current?.offsetHeight ?? 0;
      const signature = [
        rect ? `${rect.top}:${rect.left}:${rect.width}:${rect.height}` : "none",
        cardHeight,
        window.innerWidth,
        window.innerHeight,
      ].join("|");

      if (signature !== previous) {
        previous = signature;
        setLayout({
          stepId: step.id,
          ...placeCard(rect ? clipToViewport(padRect(rect)) : null, cardHeight),
        });
      }

      frameId = window.requestAnimationFrame(track);
    }

    track();

    return () => window.cancelAnimationFrame(frameId);
  }, [step]);

  const goNext = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }

    setIndex((value) => Math.min(value + 1, steps.length - 1));
  }, [isLast, onClose, setIndex, steps.length]);

  const goBack = useCallback(() => {
    setIndex((value) => Math.max(value - 1, 0));
  }, [setIndex]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleCardKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goBack();
      return;
    }

    if (event.key !== "Tab" || !cardRef.current) {
      return;
    }

    // Keep keyboard focus inside the tutorial card while it is open.
    const focusable = Array.from(
      cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (!first || !last) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!step) {
    return null;
  }

  const spot = current?.spot ?? null;
  const titleId = `lpTutorialTitle-${step.id}`;
  const bodyId = `lpTutorialBody-${step.id}`;

  return (
    <div className="lp-tutorial" data-mode={current?.mode ?? "center"}>
      {/* Blocks taps on the game while the tour is open. */}
      <div
        className={["lp-tutorial-backdrop", spot ? "" : "is-dimmed"].join(" ")}
        aria-hidden="true"
      />
      {spot ? (
        <div
          className="lp-tutorial-spotlight"
          aria-hidden="true"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
        />
      ) : null}
      <div
        ref={cardRef}
        key={step.id}
        className="lp-tutorial-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        style={current ? current.style : { visibility: "hidden" }}
        onKeyDown={handleCardKeyDown}
      >
        <button
          type="button"
          className="lp-tutorial-close"
          aria-label="Закрыть обучение"
          onClick={onClose}
        >
          ×
        </button>
        <span className="lp-tutorial-counter">
          {isFirst ? "Как играть" : `Шаг ${index} из ${steps.length - 1}`}
        </span>
        <h3 id={titleId}>{step.title}</h3>
        <p id={bodyId}>{step.body(clubName)}</p>
        <div className="lp-tutorial-actions">
          {isFirst ? (
            <button
              type="button"
              className="lp-tutorial-secondary"
              onClick={onClose}
            >
              Позже
            </button>
          ) : (
            <button
              type="button"
              className="lp-tutorial-secondary"
              onClick={goBack}
            >
              Назад
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            className="lp-tutorial-primary"
            onClick={goNext}
          >
            {isFirst ? "Показать" : isLast ? "Готово" : "Далее"}
          </button>
        </div>
        {!isFirst && !isLast ? (
          <button type="button" className="lp-tutorial-skip" onClick={onClose}>
            Пропустить обучение
          </button>
        ) : null}
      </div>
      <style>{gameTutorialCss}</style>
    </div>
  );
}

export function TutorialMenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function placeCard(
  spot: Rect | null,
  cardHeight: number,
): { spot: Rect | null; mode: CardMode; style: CSSProperties } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (!spot) {
    return { spot, mode: "center", style: {} };
  }

  if (viewportWidth <= SHEET_BREAKPOINT) {
    return { spot, mode: "sheet", style: {} };
  }

  const cardWidth = Math.min(380, viewportWidth - VIEWPORT_MARGIN * 2);
  const left = clamp(
    spot.left,
    VIEWPORT_MARGIN,
    viewportWidth - cardWidth - VIEWPORT_MARGIN,
  );
  const below = spot.top + spot.height + CARD_GAP;
  const above = spot.top - CARD_GAP - cardHeight;
  const rightSide = spot.left + spot.width + CARD_GAP;
  const leftSide = spot.left - CARD_GAP - cardWidth;
  const sideTop = clamp(
    spot.top,
    VIEWPORT_MARGIN,
    viewportHeight - cardHeight - VIEWPORT_MARGIN,
  );

  if (below + cardHeight <= viewportHeight - VIEWPORT_MARGIN) {
    return {
      spot,
      mode: "float",
      style: { top: below, left, width: cardWidth },
    };
  }

  if (above >= VIEWPORT_MARGIN) {
    return {
      spot,
      mode: "float",
      style: { top: above, left, width: cardWidth },
    };
  }

  if (rightSide + cardWidth <= viewportWidth - VIEWPORT_MARGIN) {
    return {
      spot,
      mode: "float",
      style: { top: sideTop, left: rightSide, width: cardWidth },
    };
  }

  if (leftSide >= VIEWPORT_MARGIN) {
    return {
      spot,
      mode: "float",
      style: { top: sideTop, left: leftSide, width: cardWidth },
    };
  }

  return { spot, mode: "sheet", style: {} };
}

function availableSteps(gameAccounts: boolean): GameTutorialStep[] {
  return gameTutorialStepsFor({ gameAccounts }).filter(
    (step) => step.targets === null || findTargets(step).length > 0,
  );
}

function findTargets(step: GameTutorialStep): HTMLElement[] {
  if (!step.targets) {
    return [];
  }

  const root = document.querySelector(".lp-club-home") ?? document;

  return step.targets.flatMap((selector) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      isVisibleElement,
    ),
  );
}

function isVisibleElement(element: HTMLElement) {
  if (element.closest("[hidden]")) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}

function unionRect(elements: HTMLElement[]): Rect | null {
  if (!elements.length) {
    return null;
  }

  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    top = Math.min(top, rect.top);
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  return {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
}

function padRect(rect: Rect): Rect {
  return {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
}

// A block inside a horizontal scroller (the Battle Pass chain on phones) can
// be wider than the screen; the spotlight only frames its visible part.
function clipToViewport(rect: Rect): Rect {
  const left = Math.max(rect.left, 4);
  const right = Math.min(rect.left + rect.width, window.innerWidth - 4);

  return { ...rect, left, width: Math.max(right - left, 0) };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
