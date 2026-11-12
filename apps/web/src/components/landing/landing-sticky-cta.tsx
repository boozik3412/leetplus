"use client";

import { useEffect, useState } from "react";
import { LANDING_GOALS } from "@/components/landing/landing-config";

/**
 * Phone-only bar pinned to the bottom of the screen with the owner's request
 * button. It appears once the hero is scrolled past and hides while the
 * «Подключить клуб» block itself is on screen. Hidden above 600 px by CSS.
 */
export function LandingStickyCta() {
  const [heroVisible, setHeroVisible] = useState(true);
  const [startVisible, setStartVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    const start = document.getElementById("start");

    if (!hero || !start) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) {
          setHeroVisible(entry.isIntersecting);
        } else if (entry.target === start) {
          setStartVisible(entry.isIntersecting);
        }
      }
    });

    observer.observe(hero);
    observer.observe(start);

    return () => observer.disconnect();
  }, []);

  const shown = !heroVisible && !startVisible;

  return (
    <div className="lp-sticky-cta" data-shown={shown ? "true" : "false"} aria-hidden={shown ? undefined : true}>
    <a href="#start" tabIndex={shown ? undefined : -1} data-goal={LANDING_GOALS.startCta} data-goal-place="sticky" className="lp-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", background: "linear-gradient(90deg, #83E4EC, #B8F1F5)", color: "#050B10", fontWeight: "800", fontSize: "17px", padding: "14px 20px", borderRadius: "14px", minHeight: "52px", boxShadow: "0 10px 30px rgba(131, 228, 236, 0.3)" }}>Подключить клуб бесплатно</a>
    </div>
  );
}
