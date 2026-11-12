"use client";

import { useEffect } from "react";
import { LANDING_GOALS, YANDEX_METRIKA_COUNTER_ID } from "@/components/landing/landing-config";

type YandexMetrika = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };

declare global {
  interface Window {
    ym?: YandexMetrika;
  }
}

const METRIKA_SRC = "https://mc.yandex.ru/metrika/tag.js";

/**
 * Loads Yandex.Metrika on the homepage and reports goals.
 * A click on any element with `data-goal` sends that goal with its
 * `data-goal-place` (header, hero, pricing…), so one goal id covers every copy
 * of a button and the place shows which copy was used.
 * Does nothing while YANDEX_METRIKA_COUNTER_ID is null.
 */
export function LandingAnalytics() {
  useEffect(() => {
    const counterId = YANDEX_METRIKA_COUNTER_ID;

    if (counterId === null) {
      return;
    }

    const ym = loadMetrika();

    ym(counterId, "init", {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
    });

    const reach = (goal: string, place?: string) => {
      ym(counterId, "reachGoal", goal, place ? { place } : undefined);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-goal]") : null;

      if (target?.dataset.goal) {
        reach(target.dataset.goal, target.dataset.goalPlace);
      }
    };

    document.addEventListener("click", onClick, { capture: true });

    const sections: Array<[string, string]> = [
      ["pricing", LANDING_GOALS.viewPricing],
      ["start", LANDING_GOALS.viewStart],
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          const goal = sections.find(([id]) => id === entry.target.id)?.[1];

          if (goal) {
            reach(goal);
          }

          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.3 },
    );

    for (const [id] of sections) {
      const element = document.getElementById(id);

      if (element) {
        observer.observe(element);
      }
    }

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      observer.disconnect();
    };
  }, []);

  return null;
}

function loadMetrika(): YandexMetrika {
  if (!window.ym) {
    const queue: YandexMetrika = (...args: unknown[]) => {
      (queue.a = queue.a ?? []).push(args);
    };
    queue.l = Date.now();
    window.ym = queue;
  }

  if (!document.querySelector(`script[src="${METRIKA_SRC}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = METRIKA_SRC;
    document.head.appendChild(script);
  }

  return (...args: unknown[]) => window.ym?.(...args);
}
