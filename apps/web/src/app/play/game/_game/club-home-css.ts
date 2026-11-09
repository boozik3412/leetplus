export const clubHomeCss = `
.lp-club-home-page {
  min-height: 100vh;
  color: #edf7f8;
  background: #000;
  letter-spacing: 0;
  overflow-x: hidden;
}

.lp-club-home-page *,
.lp-club-home-page *::before,
.lp-club-home-page *::after {
  box-sizing: border-box;
}

.lp-club-home {
  --bg: #000;
  --panel: rgba(8, 14, 18, 0.9);
  --panel-strong: rgba(10, 18, 22, 0.96);
  --line: rgba(196, 224, 225, 0.18);
  --line-strong: rgba(140, 230, 237, 0.56);
  --text: #edf7f8;
  --muted: #a8b9ba;
  --quiet: #71878a;
  --cyan: #83e4ec;
  --teal: #54bfc6;
  --amber: #d0aa6c;
  --good: #94d6b8;
  --radius: 8px;
  --shadow: 0 30px 90px rgba(0, 0, 0, 0.48);
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  background:
    radial-gradient(circle at 72% 8%, rgba(131, 228, 236, 0.08), transparent 28%),
    radial-gradient(circle at 18% 68%, rgba(208, 170, 108, 0.045), transparent 26%),
    #000;
}

.lp-club-home::before,
.lp-club-home-static::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.72;
  background-image:
    linear-gradient(rgba(160, 223, 225, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(160, 223, 225, 0.028) 1px, transparent 1px);
  background-size: 96px 96px;
  mask-image: linear-gradient(180deg, transparent, #000 12%, #000 86%, transparent);
}

.lp-club-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  min-height: 78px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.96), rgba(0, 0, 0, 0.72), transparent);
  backdrop-filter: blur(14px);
}

.lp-club-topbar-inner {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  width: min(1480px, 100%);
  min-height: 78px;
  margin: 0 auto;
  padding: 18px clamp(18px, 3.4vw, 46px);
}

.lp-club-menu-button,
.lp-club-icon-badge {
  appearance: none;
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid rgba(196, 224, 225, 0.2);
  border-radius: 8px;
  color: #edf7f8;
  background: rgba(196, 224, 225, 0.035);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-menu-button {
  cursor: pointer;
}

.lp-club-refresh-button {
  cursor: pointer;
}

.lp-club-refresh-button:disabled {
  cursor: progress;
  opacity: 0.58;
}

.lp-club-refresh-button:disabled:hover {
  border-color: rgba(196, 224, 225, 0.2);
  background: rgba(196, 224, 225, 0.035);
  transform: none;
}

.lp-club-refresh-button:disabled svg {
  animation: lp-refresh-spin 900ms linear infinite;
}

@keyframes lp-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.lp-club-menu {
  position: relative;
}

.lp-club-menu-button:hover,
.lp-club-icon-badge:hover {
  border-color: rgba(131, 228, 236, 0.58);
  background: rgba(131, 228, 236, 0.08);
  transform: translateY(-1px);
}

.lp-club-menu-panel {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 30;
  display: grid;
  width: min(220px, calc(100vw - 36px));
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.08), transparent 42%),
    rgba(4, 10, 13, 0.96);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.58);
}

.lp-club-menu-panel[hidden] {
  display: none;
}

.lp-club-menu-panel a,
.lp-club-menu-panel button {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 780;
  text-align: left;
  text-decoration: none;
  background: transparent;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-menu-panel a:hover,
.lp-club-menu-panel button:hover,
.lp-club-menu-panel a:focus-visible,
.lp-club-menu-panel button:focus-visible {
  border-color: rgba(131, 228, 236, 0.34);
  outline: none;
  background: rgba(131, 228, 236, 0.08);
  transform: translateY(-1px);
}

.lp-club-menu-panel svg {
  width: 18px;
  height: 18px;
  color: var(--cyan);
}

.lp-club-home svg,
.lp-club-home-static svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.8;
}

.lp-club-network {
  display: flex;
  align-items: center;
  gap: clamp(18px, 4vw, 54px);
  min-width: 0;
}

.lp-club-brand,
.lp-club-switch {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  text-decoration: none;
  text-transform: uppercase;
}

.lp-club-brand {
  gap: 12px;
  color: var(--text);
  font-size: 17px;
  font-weight: 820;
  letter-spacing: 0.14em;
}

.lp-club-brand-mark {
  position: relative;
  display: block;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
}

.lp-club-brand-mark svg,
.lp-club-brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.lp-club-switch {
  gap: 9px;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.12em;
}

.lp-club-switch > a {
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.lp-club-switch > a,
.lp-club-brand span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-session-state {
  justify-self: end;
  display: inline-flex;
  height: var(--lp-club-header-control-size);
  box-sizing: border-box;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
  border: var(--lp-club-header-control-border);
  border-radius: var(--lp-club-header-control-radius);
  background: var(--lp-club-header-control-background);
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.12em;
  white-space: nowrap;
  text-transform: uppercase;
}

.lp-club-session-state::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 16px rgba(131, 228, 236, 0.64);
}

.lp-club-header-actions {
  --lp-club-header-control-size: 44px;
  --lp-club-header-control-border: 1px solid rgba(196, 224, 225, 0.2);
  --lp-club-header-control-radius: 8px;
  --lp-club-header-control-background: rgba(196, 224, 225, 0.035);
  position: relative;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
}

.lp-reward-wallet-item-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: 8px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.06);
}

.lp-reward-wallet-item-icon svg,
.lp-reward-wallet-item-icon img {
  width: 17px;
  height: 17px;
  object-fit: contain;
}

.lp-club-shell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  width: min(1480px, 100%);
  min-height: calc(100vh - 78px);
  margin: 0 auto;
  padding: 18px clamp(18px, 3.4vw, 46px) 32px;
}

.lp-club-main-flow {
  display: grid;
  grid-template-rows: minmax(250px, auto) auto minmax(220px, 1fr);
  gap: 20px;
  min-width: 0;
}

.lp-club-stage {
  display: block;
  min-width: 0;
}

.lp-club-card,
.lp-club-panel,
.lp-club-profile-panel,
.lp-club-static-card {
  position: relative;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 26%),
    var(--panel);
  box-shadow: var(--shadow);
}

.lp-club-card::before,
.lp-club-panel::before,
.lp-club-profile-panel::before,
.lp-club-static-card::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -1px;
  width: 42px;
  height: 42px;
  border-top: 1px solid var(--cyan);
  border-left: 1px solid var(--cyan);
  border-top-left-radius: var(--radius);
  pointer-events: none;
}

.lp-club-card {
  min-height: 250px;
  overflow: hidden;
  padding: 24px;
}

.lp-club-card::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(131, 228, 236, 0.58), transparent);
}

.lp-club-label,
.lp-club-small-label {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-club-label {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.lp-club-label::before {
  content: "";
  width: 36px;
  height: 1px;
  background: linear-gradient(90deg, var(--cyan), transparent);
}

.lp-club-home h1,
.lp-club-home h2,
.lp-club-home h3,
.lp-club-home p,
.lp-club-home-static h1,
.lp-club-home-static p {
  margin: 0;
}

.lp-club-card h1 {
  max-width: 560px;
  margin-top: 34px;
  color: var(--text);
  font-size: 68px;
  line-height: 0.92;
  font-weight: 760;
}

.lp-club-card p {
  max-width: 560px;
  margin-top: 18px;
  color: #c2d0d1;
  font-size: 16px;
  line-height: 1.62;
}

.lp-club-quick-metrics {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 12px;
  margin-top: 28px;
}

.lp-club-metric {
  min-width: 92px;
  padding: 12px 13px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  background: rgba(2, 8, 11, 0.46);
}

.lp-club-metric strong {
  display: block;
  color: var(--cyan);
  font-size: 18px;
  line-height: 1;
}

.lp-club-metric span {
  display: block;
  margin-top: 7px;
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-banner-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  min-width: 0;
}

.lp-club-banner {
  position: relative;
  min-height: 360px;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
  background:
    linear-gradient(180deg, rgba(131, 228, 236, 0.11), transparent 34%),
    rgba(5, 11, 14, 0.82);
  transition:
    border-color 180ms ease,
    transform 180ms ease,
    background 180ms ease;
}

.lp-club-banner:hover {
  border-color: rgba(131, 228, 236, 0.58);
  transform: translateY(-2px);
}

.lp-club-banner::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0.7;
  background:
    linear-gradient(135deg, transparent 0 34%, rgba(131, 228, 236, 0.12) 34% 35%, transparent 35% 100%),
    radial-gradient(circle at 72% 18%, rgba(131, 228, 236, 0.16), transparent 24%);
}

.lp-club-banner.is-featured {
  background:
    linear-gradient(180deg, rgba(208, 170, 108, 0.17), transparent 36%),
    rgba(7, 12, 16, 0.86);
}

.lp-club-banner.is-featured::before {
  background:
    radial-gradient(circle at 70% 18%, rgba(208, 170, 108, 0.2), transparent 24%),
    linear-gradient(135deg, transparent 0 38%, rgba(208, 170, 108, 0.15) 38% 39%, transparent 39% 100%);
}

.lp-club-banner.has-image {
  background:
    linear-gradient(180deg, rgba(3, 7, 9, 0.2), transparent 36%),
    rgba(5, 11, 14, 0.82);
}

.lp-club-banner.has-image::before {
  background:
    linear-gradient(180deg, rgba(3, 7, 9, 0.08), rgba(3, 7, 9, 0.66)),
    linear-gradient(135deg, transparent 0 34%, rgba(131, 228, 236, 0.12) 34% 35%, transparent 35% 100%);
}

.lp-club-banner-media {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: grid;
  place-items: center;
  padding: 0;
  background: rgba(3, 7, 9, 0.34);
}

.lp-club-banner-media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.lp-club-banner-content {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: space-between;
  padding: 18px;
}

.lp-club-banner-kicker,
.lp-club-banner-title,
.lp-club-banner-copy {
  display: block;
}

.lp-club-banner-kicker {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-club-banner-title {
  margin-top: 18px;
  color: var(--text);
  font-size: var(--banner-title-size, 24px);
  line-height: var(--banner-title-line-height, 1.05);
  font-weight: 780;
  overflow-wrap: anywhere;
}

.lp-club-banner-copy {
  margin-top: 10px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.lp-club-banner-tag {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--cyan);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-club-lootboxes,
.lp-club-battlepass,
.lp-club-profile-panel {
  padding: 18px;
}

.lp-club-section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.lp-club-section-head h2,
.lp-club-detail-head h2 {
  color: var(--text);
  font-size: 24px;
  line-height: 1.08;
  font-weight: 740;
}

.lp-club-section-head p {
  margin-top: 7px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.lp-club-loot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.lp-club-loot-empty {
  grid-column: 1 / -1;
  min-height: 132px;
  display: grid;
  place-items: center;
  margin: 0;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
  background: rgba(196, 224, 225, 0.035);
}

.lootbox-entry {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(132px, 1fr) auto;
  min-height: 276px;
  overflow: hidden;
  padding: 17px;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: var(--radius);
  color: inherit;
  text-align: left;
  background:
    radial-gradient(circle at 50% 46%, rgba(131, 228, 236, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(131, 228, 236, 0.08), transparent 38%),
    rgba(4, 11, 14, 0.92);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.38),
    inset 0 0 0 1px rgba(131, 228, 236, 0.07);
  cursor: pointer;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.lootbox-entry::before {
  content: "";
  position: absolute;
  inset: 12px;
  border: 1px solid rgba(196, 224, 225, 0.08);
  border-radius: 6px;
  pointer-events: none;
}

.lootbox-entry:hover,
.lootbox-entry:focus-visible,
.lootbox-entry.is-active {
  border-color: rgba(131, 228, 236, 0.7);
  box-shadow:
    0 30px 92px rgba(0, 0, 0, 0.48),
    0 0 32px rgba(131, 228, 236, 0.14);
  outline: none;
}

.lootbox-entry.is-disabled {
  border-color: rgba(196, 224, 225, 0.12);
  cursor: pointer;
  opacity: 0.62;
}

.lootbox-entry.is-disabled:hover,
.lootbox-entry.is-disabled:focus-visible {
  border-color: rgba(196, 224, 225, 0.18);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.38),
    inset 0 0 0 1px rgba(131, 228, 236, 0.07);
}

.lp-lootbox-entry-top,
.lp-lootbox-entry-bottom {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-lootbox-entry-label,
.lp-lootbox-entry-state {
  color: var(--cyan);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-entry-top strong {
  display: block;
  margin-top: 7px;
  color: var(--text);
  font-size: 20px;
  line-height: 1.05;
  font-weight: 780;
}

.lp-lootbox-entry-state {
  flex: 0 0 auto;
  color: var(--amber);
}

.lp-lootbox-entry-state.is-wallet-ready {
  color: var(--cyan);
  text-shadow: 0 0 14px rgba(131, 228, 236, 0.28);
}

.lp-lootbox-entry-state-wrap {
  position: relative;
  z-index: 3;
  display: inline-flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: 48%;
}

.lp-lootbox-blocker-chip {
  position: relative;
  display: inline-flex;
  min-height: 22px;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  padding: 5px 8px;
  border: 1px solid rgba(208, 170, 108, 0.54);
  border-radius: 999px;
  color: var(--amber);
  background: rgba(208, 170, 108, 0.12);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

.lp-lootbox-entry-art {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 138px;
  place-items: center;
}

.lp-lootbox-entry-art::before {
  content: "";
  position: absolute;
  inset: 18px 11%;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(131, 228, 236, 0.2), transparent 64%),
    radial-gradient(circle, rgba(0, 0, 0, 0.42), transparent 68%);
  filter:
    blur(10px)
    drop-shadow(0 0 26px rgba(131, 228, 236, 0.12));
}

.lp-lootbox-entry-art img {
  position: relative;
  z-index: 1;
  width: min(94%, 230px);
  height: 158px;
  object-fit: contain;
  filter:
    drop-shadow(0 24px 36px rgba(0, 0, 0, 0.52))
    drop-shadow(0 0 22px rgba(131, 228, 236, 0.2));
  transform: translateY(8px);
  transform-origin: 50% 70%;
  transition:
    filter 180ms ease,
    transform 180ms ease;
  user-select: none;
  will-change: transform;
}

.lootbox-entry:hover .lp-lootbox-entry-art img,
.lootbox-entry:focus-visible .lp-lootbox-entry-art img {
  animation: lootboxEntryCaseHover 820ms ease-in-out infinite;
  filter:
    drop-shadow(0 28px 42px rgba(0, 0, 0, 0.56))
    drop-shadow(0 0 30px rgba(131, 228, 236, 0.28));
}

@keyframes lootboxEntryCaseHover {
  0%,
  100% {
    transform: translate3d(0, 3px, 0) rotate(0deg);
  }

  18% {
    transform: translate3d(-3px, -3px, 0) rotate(-1.5deg);
  }

  38% {
    transform: translate3d(3px, -5px, 0) rotate(1.4deg);
  }

  58% {
    transform: translate3d(-2px, -4px, 0) rotate(-0.9deg);
  }

  78% {
    transform: translate3d(2px, -2px, 0) rotate(0.8deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lootbox-entry:hover .lp-lootbox-entry-art img,
  .lootbox-entry:focus-visible .lp-lootbox-entry-art img {
    animation: none;
    transform: translateY(2px);
  }

  .lp-club-reward-wallet.is-pulsing {
    animation: none;
  }
}

.lp-lootbox-entry-bottom {
  height: 46px;
  min-height: 46px;
  overflow: hidden;
  padding-top: 13px;
  border-top: 1px solid rgba(196, 224, 225, 0.12);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.lp-lootbox-entry-hint {
  display: -webkit-box;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.lp-lootbox-wallet-ready {
  display: inline-flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--cyan);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lp-lootbox-wallet-ready svg {
  width: 17px;
  height: 17px;
}

.lootbox-entry.has-wallet-reward {
  border-color: rgba(131, 228, 236, 0.7);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.38),
    0 0 30px rgba(131, 228, 236, 0.1);
}

.lp-lootbox-mini-lock {
  display: inline-grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgba(208, 170, 108, 0.62);
  border-radius: 50%;
  color: var(--amber);
  background: rgba(0, 0, 0, 0.38);
}

.lp-lootbox-mini-lock svg {
  width: 16px;
  height: 16px;
}

.lp-quest-complete-overlay {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: center;
  padding: 22px;
  background:
    radial-gradient(circle at 50% 40%, rgba(208, 170, 108, 0.18), transparent 34%),
    rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(10px);
}

.lp-quest-complete-dialog {
  position: relative;
  width: min(430px, 100%);
  display: grid;
  gap: 14px;
  padding: 24px;
  border: 1px solid rgba(208, 170, 108, 0.4);
  border-radius: var(--radius);
  color: var(--text);
  background:
    linear-gradient(135deg, rgba(208, 170, 108, 0.12), transparent 42%),
    rgba(5, 12, 14, 0.98);
  box-shadow:
    0 34px 110px rgba(0, 0, 0, 0.62),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
}

.lp-quest-complete-close {
  position: absolute;
  right: 12px;
  top: 12px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--muted);
  background: rgba(196, 224, 225, 0.04);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.lp-quest-complete-close:hover,
.lp-quest-complete-close:focus-visible,
.lp-quest-complete-action:hover,
.lp-quest-complete-action:focus-visible {
  border-color: rgba(131, 228, 236, 0.52);
  color: var(--text);
  outline: none;
}

.lp-quest-complete-kicker {
  width: fit-content;
  border: 1px solid rgba(208, 170, 108, 0.36);
  border-radius: 999px;
  padding: 6px 9px;
  color: var(--amber);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
  background: rgba(208, 170, 108, 0.08);
}

.lp-quest-complete-dialog h3 {
  max-width: calc(100% - 42px);
  color: var(--text);
  font-size: 28px;
  line-height: 1.08;
  font-weight: 780;
}

.lp-quest-complete-reward,
.lp-quest-complete-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(196, 224, 225, 0.035);
}

.lp-quest-complete-reward span,
.lp-quest-complete-meta span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-quest-complete-reward strong {
  min-width: 0;
  color: var(--cyan);
  font-size: 15px;
  line-height: 1.2;
  text-align: right;
  overflow-wrap: anywhere;
}

.lp-checkin-complete-note {
  border: 1px solid rgba(208, 170, 108, 0.2);
  border-radius: 8px;
  padding: 11px 12px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
  background: rgba(208, 170, 108, 0.08);
}

.lp-quest-complete-dialog.is-error .lp-quest-complete-kicker {
  border-color: rgba(255, 122, 122, 0.28);
  color: #ffb4b4;
  background: rgba(255, 122, 122, 0.1);
}

.lp-quest-complete-dialog.is-error .lp-quest-complete-reward {
  border-color: rgba(255, 122, 122, 0.24);
  background: rgba(255, 122, 122, 0.08);
}

.lp-quest-complete-dialog.is-error .lp-quest-complete-reward strong {
  color: #ffd2d2;
}

.lp-quest-complete-action {
  min-height: 42px;
  border: 1px solid rgba(208, 170, 108, 0.48);
  border-radius: 7px;
  color: #061013;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0;
  background: linear-gradient(135deg, var(--amber), #f4dba0);
  cursor: pointer;
}

.lp-quest-complete-action:disabled,
.lp-completion-ack-secondary:disabled {
  cursor: progress;
  opacity: 0.58;
}

.lp-completion-ack-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.lp-completion-ack-actions .lp-quest-complete-action {
  width: 100%;
}

.lp-completion-ack-secondary {
  min-height: 42px;
  border: 1px solid rgba(131, 228, 236, 0.34);
  border-radius: 7px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.06);
  font-size: 12px;
  font-weight: 860;
  cursor: pointer;
}

.lp-completion-ack-secondary:hover,
.lp-completion-ack-secondary:focus-visible {
  border-color: rgba(131, 228, 236, 0.62);
  color: var(--text);
  outline: none;
}

.lp-completion-ack-error {
  margin: 0;
  border: 1px solid rgba(255, 122, 122, 0.26);
  border-radius: 8px;
  padding: 10px 12px;
  color: #ffd2d2;
  background: rgba(255, 122, 122, 0.08);
  font-size: 12px;
  line-height: 1.4;
}

.lp-lootbox-unavailable-dialog,
.lp-quest-details-dialog {
  width: min(500px, 100%);
  border-color: rgba(131, 228, 236, 0.34);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.1), transparent 44%),
    rgba(5, 12, 14, 0.98);
}

.lp-lootbox-unavailable-dialog {
  max-height: calc(100dvh - 28px);
  overflow-y: auto;
}

.lp-quest-details-dialog {
  width: min(500px, 100%);
  max-width: 100%;
  max-height: calc(100dvh - 28px);
  overflow-x: hidden;
  overflow-y: auto;
  gap: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: 0 34px 110px rgba(0, 0, 0, 0.62);
}

.lp-quest-details-dialog > fieldset,
.lp-quest-details-dialog > fieldset > div {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.lp-lootbox-unavailable-kicker {
  border-color: rgba(131, 228, 236, 0.36);
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
}

.lp-lootbox-unavailable-lead {
  margin-top: -4px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}

.lp-quest-details-block,
.lp-quest-details-progress {
  display: grid;
  gap: 9px;
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  padding: 13px;
  background: rgba(196, 224, 225, 0.035);
}

.lp-quest-details-block > span,
.lp-quest-details-progress span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-quest-details-block strong {
  color: var(--text);
  font-size: 13px;
  line-height: 1.4;
  font-weight: 620;
}

.lp-quest-details-block.is-reward strong {
  color: var(--cyan);
  font-size: 16px;
  font-weight: 880;
}

.lp-quest-details-progress > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.lp-quest-details-progress strong {
  color: var(--text);
  font-size: 14px;
}

.lp-quest-details-meter {
  display: block;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.09);
}

.lp-quest-details-meter i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
  box-shadow: 0 0 14px rgba(131, 228, 236, 0.4);
}

.lp-lootbox-unavailable-block,
.lp-lootbox-unavailable-drops {
  display: grid;
  gap: 9px;
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  padding: 13px;
  background: rgba(196, 224, 225, 0.035);
}

.lp-lootbox-unavailable-block > span,
.lp-lootbox-unavailable-drops > span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-unavailable-block ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lp-lootbox-unavailable-block li {
  position: relative;
  min-height: 22px;
  padding-left: 20px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.35;
}

.lp-lootbox-unavailable-block li::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 0.58em;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 14px rgba(131, 228, 236, 0.52);
}

.lp-lootbox-unavailable-drops ul {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lp-lootbox-unavailable-drops li {
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 35px;
  border: 1px solid rgba(196, 224, 225, 0.09);
  border-radius: 7px;
  padding: 7px 9px;
  background: rgba(2, 8, 10, 0.42);
}

.lp-lootbox-unavailable-drops li > span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9bb6b8;
  box-shadow: 0 0 10px rgba(155, 182, 184, 0.36);
}

.lp-lootbox-unavailable-drops li > span[data-rarity="rare"] {
  background: #7edce7;
  box-shadow: 0 0 12px rgba(126, 220, 231, 0.52);
}

.lp-lootbox-unavailable-drops li > span[data-rarity="epic"] {
  background: #bb91f2;
  box-shadow: 0 0 12px rgba(187, 145, 242, 0.52);
}

.lp-lootbox-unavailable-drops li > span[data-rarity="legendary"] {
  background: #e1b769;
  box-shadow: 0 0 12px rgba(225, 183, 105, 0.56);
}

.lp-lootbox-unavailable-drops strong {
  min-width: 0;
  color: var(--text);
  font-size: 12px;
  line-height: 1.35;
  font-weight: 720;
}

.lp-lootbox-unavailable-drops em {
  min-width: 54px;
  border: 1px solid rgba(131, 228, 236, 0.2);
  border-radius: 999px;
  padding: 4px 7px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.07);
  font-size: 11px;
  line-height: 1;
  font-style: normal;
  font-weight: 860;
  text-align: center;
}

.lp-quest-complete-dialog.has-lootbox-preview,
.lp-battlepass-detail-dialog.has-lootbox-preview,
.lp-quest-details-dialog.has-lootbox-preview {
  width: min(680px, 100%);
}

.lp-reward-lootbox-preview {
  display: grid;
  grid-template-columns: minmax(150px, 0.42fr) minmax(0, 1fr);
  gap: 14px;
  width: 100%;
  border: 1px solid rgba(131, 228, 236, 0.2);
  border-radius: 10px;
  padding: 12px;
  background:
    radial-gradient(circle at 18% 35%, rgba(131, 228, 236, 0.12), transparent 34%),
    rgba(2, 8, 10, 0.42);
}

.lp-reward-lootbox-media {
  display: grid;
  align-content: center;
  justify-items: center;
  min-width: 0;
  padding: 2px 8px 8px;
  text-align: center;
}

.lp-reward-lootbox-media img {
  width: min(180px, 100%);
  height: auto;
  margin: -12px 0 -15px;
  object-fit: contain;
  filter: drop-shadow(0 16px 24px rgba(0, 0, 0, 0.44));
}

.lp-reward-lootbox-media > span {
  color: var(--muted);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lp-reward-lootbox-media > strong {
  margin-top: 4px;
  color: var(--cyan);
  font-size: 14px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.lp-reward-lootbox-drops {
  align-self: stretch;
  border: 0;
  padding: 0;
  background: transparent;
}

@media (max-width: 560px) {
  .lp-reward-lootbox-preview {
    grid-template-columns: 1fr;
  }

  .lp-reward-lootbox-media img {
    width: 148px;
  }
}

.lp-lootbox-unavailable-status {
  margin: 0;
  border: 1px solid rgba(208, 170, 108, 0.26);
  border-radius: 8px;
  padding: 11px 12px;
  color: var(--amber);
  background: rgba(208, 170, 108, 0.08);
  font-size: 12px;
  line-height: 1.4;
}

.lp-lootbox-unavailable-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.lp-lootbox-unavailable-primary,
.lp-lootbox-unavailable-secondary {
  min-height: 42px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0;
  cursor: pointer;
}

.lp-lootbox-unavailable-primary {
  border: 1px solid rgba(131, 228, 236, 0.52);
  color: #061013;
  background: linear-gradient(135deg, var(--cyan), #9be7dd);
}

.lp-lootbox-unavailable-primary:disabled {
  cursor: progress;
  opacity: 0.58;
}

.lp-lootbox-unavailable-secondary {
  border: 1px solid rgba(196, 224, 225, 0.18);
  color: var(--text);
  background: rgba(196, 224, 225, 0.045);
}

.lp-lootbox-unavailable-primary:hover,
.lp-lootbox-unavailable-primary:focus-visible,
.lp-lootbox-unavailable-secondary:hover,
.lp-lootbox-unavailable-secondary:focus-visible {
  border-color: rgba(131, 228, 236, 0.64);
  outline: none;
}

.lp-battlepass-detail-dialog {
  width: min(560px, 100%);
  max-height: min(760px, calc(100vh - 44px));
  overflow-y: auto;
  gap: 12px;
  border-color: rgba(131, 228, 236, 0.34);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.1), transparent 44%),
    rgba(5, 12, 14, 0.98);
}

.lp-battlepass-detail-overlay {
  background:
    radial-gradient(circle at 50% 40%, rgba(131, 228, 236, 0.16), transparent 34%),
    rgba(0, 0, 0, 0.72);
}

.lp-battlepass-detail-dialog .lp-quest-complete-kicker {
  border-color: rgba(131, 228, 236, 0.34);
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
}

.lp-battlepass-detail-dialog .lp-quest-complete-close {
  border-color: rgba(131, 228, 236, 0.18);
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.045);
}

.lp-battlepass-season-rewards-dialog {
  width: min(620px, 100%);
  gap: 15px;
}

.lp-battlepass-season-rewards-lead {
  max-width: 54ch;
  margin: -4px 0 2px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.lp-battlepass-season-rewards-content,
.lp-battlepass-season-reward-group {
  display: grid;
  gap: 10px;
}

.lp-battlepass-season-rewards-content {
  gap: 18px;
  padding: 4px 0;
}

.lp-battlepass-season-reward-heading {
  color: var(--muted);
  font-size: 10px;
  font-weight: 840;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-battlepass-season-range-list {
  display: grid;
}

.lp-battlepass-season-range-header,
.lp-battlepass-season-range-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(118px, auto) 24px minmax(118px, auto);
  align-items: center;
  gap: 8px;
}

.lp-battlepass-season-range-header {
  color: var(--muted);
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
  padding: 0 0 12px;
}

.lp-battlepass-season-range-header > span:not(:first-child) {
  font-size: 10px;
  font-weight: 840;
  letter-spacing: 0;
  line-height: 1;
  text-align: center;
  text-transform: uppercase;
}

.lp-battlepass-season-range-header > span:last-child {
  grid-column: 4;
}

.lp-battlepass-season-range-row {
  min-height: 56px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-battlepass-season-range-row > strong {
  color: var(--text);
  font-size: 14px;
  line-height: 1.3;
}

.lp-battlepass-season-range-row > b {
  color: var(--cyan);
  font-size: 16px;
  font-weight: 880;
  text-align: center;
  white-space: nowrap;
}

.lp-battlepass-season-range-row > b.is-empty {
  color: var(--muted);
}

.lp-battlepass-season-range-row i {
  color: var(--amber);
  font-size: 16px;
  font-style: normal;
  text-align: center;
}

.lp-battlepass-season-guaranteed-mark {
  display: block;
  justify-self: center;
  color: var(--cyan);
  font-size: 16px;
  font-weight: 880;
  line-height: 1;
  white-space: nowrap;
}

.lp-battlepass-season-fixed-list,
.lp-battlepass-season-possible-list {
  display: grid;
  gap: 8px;
}

.lp-battlepass-season-fixed-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  color: var(--text);
}

.lp-battlepass-season-fixed-row > span {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(131, 228, 236, 0.3);
  border-radius: 50%;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.07);
  font-size: 11px;
}

.lp-battlepass-season-fixed-row strong,
.lp-battlepass-season-fixed-row b {
  font-size: 13px;
  line-height: 1.35;
}

.lp-battlepass-season-fixed-row b {
  color: var(--amber);
}

.lp-battlepass-season-possible-list > div {
  display: grid;
  grid-template-columns: minmax(120px, 0.45fr) minmax(0, 1fr);
  gap: 16px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.1);
  padding: 10px 0;
}

.lp-battlepass-season-possible-list strong {
  color: var(--text);
  font-size: 13px;
}

.lp-battlepass-season-possible-list span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.lp-battlepass-season-rewards-note,
.lp-battlepass-season-rewards-empty {
  margin: 0;
  border-left: 2px solid rgba(208, 170, 108, 0.62);
  padding: 9px 12px;
  color: var(--amber);
  background: rgba(208, 170, 108, 0.055);
  font-size: 11px;
  line-height: 1.5;
}

.lp-battlepass-level-complete-dialog {
  width: min(520px, 100%);
  justify-items: start;
  background:
    radial-gradient(circle at 50% 22%, rgba(131, 228, 236, 0.18), transparent 30%),
    linear-gradient(145deg, rgba(131, 228, 236, 0.08), transparent 48%),
    rgba(5, 12, 14, 0.99);
}

.lp-battlepass-level-complete-mark {
  display: grid;
  place-items: center;
  width: 66px;
  height: 66px;
  border: 1px solid rgba(131, 228, 236, 0.54);
  border-radius: 50%;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  box-shadow:
    0 0 0 7px rgba(131, 228, 236, 0.035),
    0 0 34px rgba(131, 228, 236, 0.18);
  font-size: 26px;
  font-weight: 900;
}

.lp-battlepass-level-complete-lead {
  max-width: 46ch;
  margin: -3px 0 2px;
  color: var(--text);
  font-size: 14px;
  line-height: 1.55;
}

.lp-battlepass-level-complete-dialog .lp-battlepass-detail-lines {
  width: 100%;
}

.lp-battlepass-level-complete-dialog .lp-quest-complete-action {
  width: 100%;
}

.lp-battlepass-detail-season {
  margin-top: -6px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.lp-battlepass-detail-progress {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(131, 228, 236, 0.16);
  border-radius: 8px;
  padding: 12px;
  background: rgba(131, 228, 236, 0.055);
}

.lp-battlepass-detail-progress > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-battlepass-detail-progress span,
.lp-battlepass-detail-block span,
.lp-battlepass-received-card > span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-battlepass-detail-progress strong {
  color: var(--cyan);
  font-size: 15px;
  font-weight: 860;
}

.lp-battlepass-detail-meter {
  position: relative;
  overflow: hidden;
  height: 8px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.1);
}

.lp-battlepass-detail-meter i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
}

.lp-battlepass-detail-lines {
  display: grid;
  gap: 12px;
  padding: 2px 0;
}

.lp-battlepass-detail-line {
  display: grid;
  gap: 5px;
  border-top: 1px solid rgba(196, 224, 225, 0.11);
  padding-top: 12px;
}

.lp-battlepass-detail-line:first-child {
  border-top: 0;
  padding-top: 0;
}

.lp-battlepass-detail-line span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-battlepass-detail-line p {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}

.lp-battlepass-detail-line strong {
  color: var(--text);
  font-size: 14px;
  font-weight: 820;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.lp-battlepass-detail-line.is-current strong,
.lp-battlepass-detail-line.is-reward strong {
  color: var(--cyan);
}

.lp-battlepass-detail-block,
.lp-battlepass-received-card {
  display: grid;
  gap: 7px;
  border: 1px solid rgba(196, 224, 225, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(196, 224, 225, 0.035);
}

.lp-battlepass-detail-block.is-current {
  border-color: rgba(131, 228, 236, 0.28);
  background: rgba(131, 228, 236, 0.07);
}

.lp-battlepass-detail-block strong,
.lp-battlepass-received-card strong {
  color: var(--text);
  font-size: 15px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.lp-battlepass-detail-block p,
.lp-battlepass-received-card p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.lp-battlepass-help-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lp-battlepass-help-list li {
  position: relative;
  min-height: 22px;
  padding-left: 20px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.42;
}

.lp-battlepass-help-list li::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 0.58em;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 14px rgba(131, 228, 236, 0.52);
}

.lp-battlepass-help-note {
  margin: 0;
  border: 1px solid rgba(208, 170, 108, 0.26);
  border-radius: 8px;
  padding: 11px 12px;
  color: var(--amber);
  background: rgba(208, 170, 108, 0.08);
  font-size: 12px;
  line-height: 1.4;
}

.lp-battlepass-planned-reward strong {
  color: var(--cyan);
}

.lp-battlepass-detail-dialog .lp-battlepass-planned-reward {
  border-color: rgba(131, 228, 236, 0.18);
  background: rgba(131, 228, 236, 0.045);
}

.lp-battlepass-detail-dialog .lp-quest-complete-action {
  border-color: rgba(131, 228, 236, 0.44);
  color: #001012;
  background: linear-gradient(135deg, var(--cyan), var(--teal));
  box-shadow: 0 12px 34px rgba(84, 191, 198, 0.16);
}

.lp-battlepass-detail-dialog .lp-quest-complete-action:hover,
.lp-battlepass-detail-dialog .lp-quest-complete-action:focus-visible {
  border-color: rgba(131, 228, 236, 0.76);
  color: #001012;
  transform: translateY(-1px);
}

.lp-battlepass-received-card {
  border-color: rgba(148, 214, 184, 0.26);
  background: rgba(148, 214, 184, 0.07);
}

.lp-battlepass-received-card small {
  color: var(--cyan);
  font-size: 11px;
  font-weight: 760;
  line-height: 1.35;
}

.lp-battlepass-received-card em {
  width: fit-content;
  border: 1px dashed rgba(131, 228, 236, 0.44);
  border-radius: 7px;
  padding: 7px 9px;
  color: var(--text);
  font-size: 12px;
  font-style: normal;
  font-weight: 860;
  overflow-wrap: anywhere;
}

.lp-battlepass-reward-history-link {
  width: fit-content;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 820;
  line-height: 1.35;
  text-decoration: underline;
  text-decoration-color: rgba(131, 228, 236, 0.54);
  text-underline-offset: 3px;
}

.lp-battlepass-reward-history-link:hover,
.lp-battlepass-reward-history-link:focus-visible {
  color: var(--text);
  text-decoration-color: currentColor;
}

.lp-lootbox-overlay {
  --rarity-accent: #83e4ec;
  --rarity-accent-rgb: 131 228 236;
  --rarity-warm: #d0aa6c;
  --rarity-warm-rgb: 208 170 108;
  --rarity-grid-opacity: 0.16;
  --rarity-field-opacity: 0.34;
  --rarity-field-scale: 0.98;
  --rarity-beam-width: min(220px, 48%);
  --rarity-beam-height: 330px;
  --rarity-beam-opacity: 0.46;
  --rarity-reward-lift: 0px;
  --rarity-glow: 0.16;
  --rarity-shock-scale: 2.6;
  --rarity-particle-opacity: 0.9;
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 50% 44%, rgb(var(--rarity-accent-rgb) / 0.12), transparent 34%),
    rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(10px);
}

.lp-lootbox-overlay.rarity-common {
  --rarity-accent: #9eb5b7;
  --rarity-accent-rgb: 158 181 183;
  --rarity-warm: #b2a37f;
  --rarity-warm-rgb: 178 163 127;
  --rarity-grid-opacity: 0.1;
  --rarity-field-opacity: 0.22;
  --rarity-field-scale: 0.9;
  --rarity-beam-width: min(170px, 42%);
  --rarity-beam-height: 270px;
  --rarity-beam-opacity: 0.28;
  --rarity-reward-lift: -6px;
  --rarity-glow: 0.08;
  --rarity-shock-scale: 1.8;
  --rarity-particle-opacity: 0.58;
}

.lp-lootbox-overlay.rarity-epic {
  --rarity-accent: #afa4ff;
  --rarity-accent-rgb: 175 164 255;
  --rarity-warm: #83e4ec;
  --rarity-warm-rgb: 131 228 236;
  --rarity-grid-opacity: 0.2;
  --rarity-field-opacity: 0.44;
  --rarity-field-scale: 1.08;
  --rarity-beam-width: min(258px, 54%);
  --rarity-beam-height: 370px;
  --rarity-beam-opacity: 0.58;
  --rarity-reward-lift: 12px;
  --rarity-glow: 0.24;
  --rarity-shock-scale: 3.1;
  --rarity-particle-opacity: 1;
}

.lp-lootbox-overlay.rarity-legendary {
  --rarity-accent: #d0aa6c;
  --rarity-accent-rgb: 208 170 108;
  --rarity-warm: #d0fbff;
  --rarity-warm-rgb: 208 251 255;
  --rarity-grid-opacity: 0.24;
  --rarity-field-opacity: 0.54;
  --rarity-field-scale: 1.16;
  --rarity-beam-width: min(306px, 62%);
  --rarity-beam-height: 420px;
  --rarity-beam-opacity: 0.72;
  --rarity-reward-lift: 26px;
  --rarity-glow: 0.34;
  --rarity-shock-scale: 3.7;
  --rarity-particle-opacity: 1;
}

.lp-lootbox-overlay.rarity-hidden {
  --rarity-accent: #9eb5b7;
  --rarity-accent-rgb: 158 181 183;
  --rarity-warm: #b9c5c6;
  --rarity-warm-rgb: 185 197 198;
  --rarity-grid-opacity: 0.1;
  --rarity-field-opacity: 0.2;
  --rarity-field-scale: 0.9;
  --rarity-beam-width: min(178px, 42%);
  --rarity-beam-height: 278px;
  --rarity-beam-opacity: 0.24;
  --rarity-reward-lift: -12px;
  --rarity-glow: 0.07;
  --rarity-shock-scale: 1.9;
  --rarity-particle-opacity: 0.52;
}

.lp-lootbox-dialog {
  position: relative;
  width: min(900px, 100%);
  max-height: calc(100dvh - 32px);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: clamp(20px, 3vw, 32px);
  border: 1px solid rgba(131, 228, 236, 0.3);
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 34%),
    rgba(4, 10, 13, 0.97);
  box-shadow:
    0 44px 130px rgba(0, 0, 0, 0.72),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
}

.lp-lootbox-dialog::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 49.8%, rgb(var(--rarity-accent-rgb) / var(--rarity-grid-opacity)) 49.8% 50%, transparent 50%),
    linear-gradient(rgba(196, 224, 225, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(196, 224, 225, 0.035) 1px, transparent 1px);
  background-size: auto, 76px 76px, 76px 76px;
  mask-image: radial-gradient(circle at 50% 54%, #000, transparent 82%);
}

.lp-lootbox-close {
  position: absolute;
  right: 18px;
  top: 18px;
  z-index: 2;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  color: var(--muted);
  background: rgba(196, 224, 225, 0.04);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.lp-lootbox-close:hover,
.lp-lootbox-close:focus-visible {
  border-color: rgba(131, 228, 236, 0.42);
  color: var(--text);
  outline: none;
}

.lp-lootbox-dialog-head {
  position: relative;
  z-index: 1;
  max-width: 540px;
  padding-right: 58px;
}

.lp-lootbox-kicker {
  color: var(--cyan);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-dialog-head h3 {
  margin-top: 10px;
  color: var(--text);
  font-size: clamp(32px, 5vw, 54px);
  line-height: 0.98;
  font-weight: 760;
}

.lp-lootbox-dialog-head p {
  margin-top: 10px;
  color: #c2d0d1;
  font-size: 14px;
  line-height: 1.55;
}

.lp-lootbox-open-error {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 9px;
  width: min(540px, 100%);
  margin-top: 14px;
  padding: 12px;
  border: 1px solid rgba(208, 170, 108, 0.42);
  border-radius: 8px;
  color: var(--text);
  background:
    linear-gradient(135deg, rgba(208, 170, 108, 0.13), transparent 72%),
    rgba(4, 11, 14, 0.74);
  box-shadow: inset 0 0 0 1px rgba(208, 170, 108, 0.08);
}

.lp-lootbox-open-error span {
  color: var(--amber);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-open-error strong {
  color: var(--text);
  font-size: 12px;
  font-weight: 720;
  line-height: 1.45;
}

.lp-lootbox-open-error button {
  width: fit-content;
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid rgba(131, 228, 236, 0.36);
  border-radius: 8px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-open-error button:hover,
.lp-lootbox-open-error button:focus-visible {
  border-color: rgba(131, 228, 236, 0.72);
  color: var(--text);
}

.lp-lootbox-open-error button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.lp-lootbox-roulette {
  position: relative;
  z-index: 2;
  width: min(760px, 100%);
  margin: 18px auto 8px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-12px) scale(0.98);
  transition:
    opacity 240ms ease,
    transform 300ms cubic-bezier(0.16, 0.86, 0.2, 1);
}

.lp-lootbox-roulette.is-visible,
.lp-lootbox-roulette.is-finished {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.lp-lootbox-roulette.is-finished {
  opacity: 0.96;
}

.lp-lootbox-roulette-window {
  position: relative;
  height: 154px;
  overflow: hidden;
  pointer-events: none;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.78), transparent 16% 84%, rgba(0, 0, 0, 0.78)),
    radial-gradient(circle at 50% 0%, rgb(var(--rarity-accent-rgb) / 0.16), transparent 40%),
    rgba(2, 8, 11, 0.86);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.62),
    inset 0 0 0 1px rgb(var(--rarity-accent-rgb) / 0.06);
  backdrop-filter: blur(18px);
}

.lp-lootbox-roulette-window::before,
.lp-lootbox-roulette-window::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 4;
  width: 18%;
  pointer-events: none;
}

.lp-lootbox-roulette-window::before {
  left: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.92), transparent);
}

.lp-lootbox-roulette-window::after {
  right: 0;
  background: linear-gradient(270deg, rgba(0, 0, 0, 0.92), transparent);
}

.lp-lootbox-roulette-track {
  position: absolute;
  left: 50%;
  top: 11px;
  display: flex;
  gap: 10px;
  pointer-events: none;
  will-change: transform;
  transform: translate3d(96px, 0, 0);
}

.lp-lootbox-roulette-card {
  --card-rgb: 158 181 183;
  flex: 0 0 104px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  align-content: stretch;
  gap: 4px;
  height: 132px;
  padding: 4px;
  border: 1px solid var(--prize-border-color, rgb(var(--card-rgb) / 0.32));
  border-radius: 7px;
  color: var(--prize-text-color, var(--text));
  text-align: left;
  background:
    radial-gradient(circle at 50% 12%, rgb(var(--card-rgb) / 0.2), transparent 42%),
    linear-gradient(160deg, rgb(var(--card-rgb) / 0.11), transparent 52%),
    var(--prize-background-color, rgba(5, 13, 16, 0.96));
  box-shadow:
    inset 0 0 0 1px rgb(var(--card-rgb) / 0.05),
    0 14px 30px rgba(0, 0, 0, 0.28);
  cursor: default;
  pointer-events: none;
  transform: translateY(0) scale(0.96);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.lp-lootbox-roulette-card[data-rarity="common"],
.lp-lootbox-roulette-card[data-rarity="hidden"] {
  --card-rgb: 158 181 183;
}

.lp-lootbox-roulette-card[data-rarity="rare"] {
  --card-rgb: 131 228 236;
}

.lp-lootbox-roulette-card[data-rarity="epic"] {
  --card-rgb: 175 164 255;
}

.lp-lootbox-roulette-card[data-rarity="legendary"] {
  --card-rgb: 208 170 108;
}

.lp-lootbox-roulette-card.is-winning {
  border-color: var(--prize-border-color, rgb(var(--card-rgb) / 0.86));
  box-shadow:
    0 0 34px rgb(var(--card-rgb) / 0.28),
    0 20px 44px rgba(0, 0, 0, 0.42),
    inset 0 0 0 1px rgb(var(--card-rgb) / 0.16);
  transform: translateY(-5px) scale(1.03);
}

.lp-lootbox-roulette.is-finished .lp-lootbox-roulette-window,
.lp-lootbox-roulette.is-finished .lp-lootbox-roulette-track {
  pointer-events: auto;
}

.lp-lootbox-roulette-card.can-collect {
  cursor: pointer;
  pointer-events: auto;
}

.lp-lootbox-roulette-card.can-collect:hover,
.lp-lootbox-roulette-card.can-collect:focus-visible {
  border-color: var(--prize-border-color, rgb(var(--card-rgb) / 0.98));
  outline: none;
  box-shadow:
    0 0 44px rgb(var(--card-rgb) / 0.34),
    0 22px 52px rgba(0, 0, 0, 0.48),
    inset 0 0 0 1px rgb(var(--card-rgb) / 0.22);
  transform: translateY(-7px) scale(1.045);
}

.lp-lootbox-roulette-card.is-collected {
  opacity: 0.82;
  filter: saturate(0.76);
}

.lp-lootbox-roulette-card:disabled {
  opacity: 1;
}

.lp-lootbox-roulette-card > strong,
.lp-lootbox-roulette-card > span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lp-lootbox-roulette-card > strong {
  padding: 2px 3px 0;
  font-size: 12px;
  line-height: 1.1;
}

.lp-lootbox-roulette-card > span:not(.lp-prize-visual) {
  padding: 0 3px 2px;
  color: var(--prize-text-color, rgb(var(--card-rgb)));
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-lootbox-roulette-visual {
  align-self: stretch;
  justify-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--prize-border-color, rgb(var(--card-rgb) / 0.5));
  border-radius: 7px;
  color: var(--prize-text-color, rgb(var(--card-rgb)));
  background:
    linear-gradient(180deg, rgb(var(--card-rgb) / 0.26), transparent),
    color-mix(in srgb, var(--prize-background-color, #050d10) 78%, transparent);
  box-shadow: 0 0 18px rgb(var(--card-rgb) / 0.15);
}

.lp-lootbox-roulette-visual img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.lp-lootbox-roulette-visual svg {
  width: 58px;
  height: 58px;
  max-width: 82%;
  max-height: 82%;
  filter: drop-shadow(0 0 8px rgb(var(--card-rgb) / 0.3));
}

.lp-lootbox-roulette-marker {
  position: absolute;
  top: -12px;
  bottom: -12px;
  left: 50%;
  z-index: 6;
  width: 2px;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, var(--amber) 18%, var(--cyan) 50%, var(--amber) 82%, transparent);
  box-shadow:
    0 0 16px rgb(var(--rarity-accent-rgb) / 0.86),
    0 0 36px rgb(var(--rarity-warm-rgb) / 0.36);
  transform: translateX(-50%);
}

.lp-lootbox-roulette-marker::before,
.lp-lootbox-roulette-marker::after {
  content: "";
  position: absolute;
  left: 50%;
  width: 22px;
  height: 18px;
  border: 1px solid rgb(var(--rarity-warm-rgb) / 0.72);
  background: rgba(0, 0, 0, 0.72);
  transform: translateX(-50%) rotate(45deg);
}

.lp-lootbox-roulette-marker::before {
  top: -5px;
}

.lp-lootbox-roulette-marker::after {
  bottom: -5px;
}

.lp-lootbox-roulette-caption {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 32px;
  padding: 8px 10px 0;
  color: var(--muted);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0;
  pointer-events: none;
  text-transform: uppercase;
}

.lp-lootbox-roulette-caption strong {
  margin-left: auto;
  max-width: min(280px, 42vw);
  overflow: hidden;
  color: var(--cyan);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-lootbox-roulette-skip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 13px;
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 7px;
  color: var(--text);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.12), transparent),
    rgba(196, 224, 225, 0.04);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
  pointer-events: auto;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(131, 228, 236, 0.05);
}

.lp-lootbox-roulette-skip:hover,
.lp-lootbox-roulette-skip:focus-visible {
  border-color: rgba(131, 228, 236, 0.58);
  color: var(--cyan);
  outline: none;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.22), transparent),
    rgba(131, 228, 236, 0.1);
}

.lp-lootbox-roulette-skip[hidden] {
  display: none;
}

.lp-lootbox-machine {
  position: relative;
  z-index: 1;
  height: clamp(300px, 44vh, 390px);
  margin: 18px 0 10px;
  isolation: isolate;
  perspective: 1200px;
  overflow: visible;
  animation: lootboxFloat 3.8s ease-in-out infinite;
}

.lp-lootbox-machine.is-ready {
  cursor: pointer;
}

.lp-lootbox-machine:focus-visible {
  outline: 1px solid rgba(131, 228, 236, 0.72);
  outline-offset: 6px;
}

.lp-lootbox-machine::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 18px;
  z-index: 0;
  width: min(330px, 62%);
  height: 34px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.54);
  filter: blur(14px);
  transform: translateX(-50%);
}

.lp-lootbox-energy-field {
  position: absolute;
  left: 50%;
  top: 52%;
  z-index: 1;
  width: min(280px, 58%);
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(var(--rarity-warm-rgb) / 0.72), rgb(var(--rarity-accent-rgb) / 0.28) 32%, transparent 68%);
  opacity: 0.22;
  filter: blur(12px);
  transform: translate(-50%, -50%) scale(0.88);
  transition:
    opacity 260ms ease,
    transform 500ms ease;
}

.lp-lootbox-shock-ring {
  position: absolute;
  left: 50%;
  bottom: 104px;
  z-index: 2;
  width: min(240px, 58%);
  aspect-ratio: 1;
  border: 1px solid rgb(var(--rarity-accent-rgb) / 0.48);
  border-radius: 50%;
  opacity: 0;
  transform: translateX(-50%) scale(0.72);
  pointer-events: none;
}

.lp-lootbox-energy-slit {
  position: absolute;
  left: 50%;
  bottom: 198px;
  z-index: 9;
  width: min(220px, 52%);
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgb(var(--rarity-warm-rgb) / 0.88), rgb(var(--rarity-accent-rgb) / 0.84), transparent);
  box-shadow: 0 0 24px rgb(var(--rarity-accent-rgb) / 0.42);
  opacity: 0;
  transform: translateX(-50%) scaleX(0.16);
  pointer-events: none;
}

.lp-lootbox-beam {
  position: absolute;
  left: 50%;
  bottom: 166px;
  z-index: 1;
  width: var(--rarity-beam-width);
  height: var(--rarity-beam-height);
  opacity: 0;
  transform: translateX(-50%) scaleY(0.2);
  transform-origin: bottom;
  background:
    linear-gradient(180deg, rgb(var(--rarity-warm-rgb) / 0.54), rgb(var(--rarity-accent-rgb) / 0.14) 46%, transparent),
    linear-gradient(90deg, transparent, rgb(var(--rarity-warm-rgb) / 0.16), transparent);
  clip-path: polygon(44% 0, 56% 0, 100% 100%, 0 100%);
  filter: blur(3px);
}

.lp-lootbox-case-image {
  position: absolute;
  left: 50%;
  bottom: 34px;
  z-index: 4;
  width: min(500px, 88%);
  height: min(318px, 72%);
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  filter:
    drop-shadow(0 32px 42px rgba(0, 0, 0, 0.58))
    drop-shadow(0 0 28px rgb(var(--rarity-accent-rgb) / 0.18));
  transform: translateX(-50%) translateY(0) scale(1);
  transform-origin: 50% 62%;
  transition:
    filter 420ms ease,
    opacity 320ms ease,
    transform 760ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lp-lootbox-case,
.lp-lootbox-core,
.lp-lootbox-particle {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.lp-lootbox-case {
  border: 1px solid rgba(196, 224, 225, 0.18);
  border-radius: 8px;
  box-shadow:
    inset 0 0 0 1px rgba(131, 228, 236, 0.08),
    0 24px 80px rgba(0, 0, 0, 0.46);
  transition: transform 760ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lp-lootbox-case-base {
  bottom: 54px;
  z-index: 3;
  width: min(320px, 72%);
  height: 160px;
  background:
    linear-gradient(90deg, transparent 0 44%, rgba(131, 228, 236, 0.22) 44% 56%, transparent 56% 100%),
    linear-gradient(180deg, #101c20, #050a0d 62%, #10191c);
}

.lp-lootbox-case-lid {
  bottom: 208px;
  z-index: 5;
  width: min(350px, 78%);
  height: 62px;
  background:
    linear-gradient(90deg, transparent 0 45%, rgba(208, 170, 108, 0.24) 45% 55%, transparent 55% 100%),
    linear-gradient(180deg, #14272c, #071014);
  transform-origin: 50% 100%;
}

.lp-lootbox-case-left,
.lp-lootbox-case-right {
  bottom: 72px;
  z-index: 4;
  width: min(116px, 26%);
  height: 132px;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.16), transparent 45%),
    #081116;
}

.lp-lootbox-case-left {
  margin-left: -102px;
}

.lp-lootbox-case-right {
  margin-left: 102px;
}

.lp-lootbox-core {
  bottom: 125px;
  z-index: 6;
  display: grid;
  width: 74px;
  height: 74px;
  place-items: center;
  border: 1px solid rgba(208, 170, 108, 0.58);
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(208, 170, 108, 0.38), transparent 56%),
    rgba(0, 0, 0, 0.48);
  box-shadow: 0 0 28px rgba(208, 170, 108, 0.22);
}

.lp-lootbox-core::before {
  content: "";
  width: 28px;
  height: 28px;
  border: 1px solid rgba(131, 228, 236, 0.74);
  transform: rotate(45deg);
}

.lp-lootbox-lock-open {
  position: absolute;
  left: 50%;
  bottom: 94px;
  z-index: 8;
  display: grid;
  width: 76px;
  height: 76px;
  place-items: center;
  border: 1px solid rgba(208, 170, 108, 0.64);
  border-radius: 50%;
  color: var(--amber);
  background:
    radial-gradient(circle, rgba(208, 170, 108, 0.28), transparent 56%),
    rgba(0, 0, 0, 0.58);
  box-shadow:
    0 0 34px rgba(208, 170, 108, 0.18),
    inset 0 0 0 1px rgba(131, 228, 236, 0.1);
  transform: translateX(-50%);
  transition:
    border-color 180ms ease,
    color 180ms ease,
    opacity 220ms ease,
    transform 420ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lp-lootbox-lock-open svg {
  width: 25px;
  height: 25px;
}

.lp-lootbox-machine.is-ready:hover .lp-lootbox-lock-open,
.lp-lootbox-machine.is-ready:focus-visible .lp-lootbox-lock-open {
  border-color: rgba(131, 228, 236, 0.88);
  color: var(--cyan);
  box-shadow:
    0 0 36px rgba(131, 228, 236, 0.28),
    0 0 80px rgba(208, 170, 108, 0.16);
}

.lp-lootbox-particle {
  bottom: 170px;
  z-index: 7;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rarity-accent);
  opacity: 0;
  box-shadow: 0 0 18px rgb(var(--rarity-accent-rgb) / 0.75);
}

.lp-lootbox-machine.is-charging {
  animation: lootboxChargeKick 720ms cubic-bezier(0.2, 0.86, 0.2, 1) both;
}

.lp-lootbox-machine.is-charging .lp-lootbox-shock-ring {
  animation: lootboxShockWave 900ms cubic-bezier(0.16, 0.84, 0.2, 1) both;
}

.lp-lootbox-machine.is-charging .lp-lootbox-energy-slit {
  animation: lootboxSlitCharge 900ms cubic-bezier(0.16, 0.84, 0.2, 1) both;
}

.lp-lootbox-machine.is-opening {
  animation: lootboxKick 1320ms cubic-bezier(0.16, 0.9, 0.18, 1) both;
}

.lp-lootbox-machine.is-open,
.lp-lootbox-machine.is-collected {
  animation: none;
  transform: translateY(-7px) scale(1) rotateX(0deg);
}

.lp-lootbox-machine.is-opening .lp-lootbox-lock-open,
.lp-lootbox-machine.is-open .lp-lootbox-lock-open,
.lp-lootbox-machine.is-collected .lp-lootbox-lock-open {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(-30px) scale(0.72);
}

.lp-lootbox-machine.is-opening .lp-lootbox-case-image,
.lp-lootbox-machine.is-open .lp-lootbox-case-image {
  filter:
    drop-shadow(0 34px 46px rgba(0, 0, 0, 0.56))
    drop-shadow(0 0 42px rgb(var(--rarity-accent-rgb) / 0.32))
    brightness(1.08);
  transform: translateX(-50%) translateY(-18px) scale(1.035) rotateX(-4deg);
}

.lp-lootbox-machine.is-collected .lp-lootbox-case-image {
  opacity: 0.72;
  transform: translateX(-50%) translateY(-8px) scale(0.98);
}

.lp-lootbox-machine.is-opening .lp-lootbox-case-lid,
.lp-lootbox-machine.is-open .lp-lootbox-case-lid {
  transform: translateX(-50%) translateY(-122px) rotateX(-66deg) rotateZ(-1deg);
}

.lp-lootbox-machine.is-opening .lp-lootbox-case-left,
.lp-lootbox-machine.is-open .lp-lootbox-case-left {
  transform: translateX(-50%) translateX(-78px) rotateY(24deg);
}

.lp-lootbox-machine.is-opening .lp-lootbox-case-right,
.lp-lootbox-machine.is-open .lp-lootbox-case-right {
  transform: translateX(-50%) translateX(78px) rotateY(-24deg);
}

.lp-lootbox-machine.is-opening .lp-lootbox-energy-field,
.lp-lootbox-machine.is-open .lp-lootbox-energy-field,
.lp-lootbox-machine.is-collected .lp-lootbox-energy-field {
  opacity: var(--rarity-field-opacity);
  transform: translate(-50%, -50%) scale(var(--rarity-field-scale));
}

.lp-lootbox-machine.is-opening .lp-lootbox-beam,
.lp-lootbox-machine.is-open .lp-lootbox-beam {
  animation: lootboxBeamRise 1320ms cubic-bezier(0.16, 0.84, 0.2, 1) 220ms both;
}

.lp-lootbox-machine.is-opening .lp-lootbox-particle,
.lp-lootbox-machine.is-open .lp-lootbox-particle {
  animation: lootboxParticleBurst 1180ms cubic-bezier(0.18, 0.84, 0.18, 1) calc(260ms + var(--particle-index) * 46ms) both;
}

.lp-lootbox-dialog-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

.lp-lootbox-dialog-actions .lp-club-primary-link,
.lp-lootbox-dialog-actions .lp-club-ghost-link {
  min-width: 180px;
  padding: 0 16px;
  cursor: pointer;
}

.lp-lootbox-dialog-actions .lp-club-primary-link:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  transform: none;
}

@keyframes lootboxFloat {
  0%,
  100% {
    transform: translateY(0) rotateX(0deg);
  }

  50% {
    transform: translateY(-8px) rotateX(1.5deg);
  }
}

@keyframes lootboxKick {
  0% {
    transform: translateY(0) scale(1) rotateX(0deg);
  }

  24% {
    transform: translateY(6px) scale(0.988) rotateX(1deg);
  }

  52% {
    transform: translateY(-13px) scale(1.014) rotateX(-1.2deg);
  }

  74% {
    transform: translateY(-5px) scale(1.004) rotateX(0.4deg);
  }

  100% {
    transform: translateY(-7px) scale(1) rotateX(0deg);
  }
}

@keyframes lootboxChargeKick {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  55% {
    transform: translateY(5px) scale(0.992);
  }
}

@keyframes lootboxShockWave {
  0% {
    opacity: 0;
    transform: translateX(-50%) scale(0.72);
  }

  22% {
    opacity: 0.9;
  }

  100% {
    opacity: 0;
    transform: translateX(-50%) scale(var(--rarity-shock-scale));
  }
}

@keyframes lootboxSlitCharge {
  0% {
    opacity: 0;
    transform: translateX(-50%) scaleX(0.16);
  }

  38% {
    opacity: 1;
  }

  100% {
    opacity: 0.72;
    transform: translateX(-50%) scaleX(0.88);
  }
}

@keyframes lootboxBeamRise {
  0% {
    opacity: 0;
    transform: translateX(-50%) scaleY(0.08);
  }

  30% {
    opacity: 0.92;
  }

  100% {
    opacity: var(--rarity-beam-opacity);
    transform: translateX(-50%) scaleY(1);
  }
}

@keyframes lootboxParticleBurst {
  0% {
    opacity: 0;
    transform: translate(-50%, 0) rotate(calc((var(--particle-index) - 4) * 28deg)) translateY(0) scale(0.28);
  }

  16% {
    opacity: var(--rarity-particle-opacity);
  }

  62% {
    opacity: var(--rarity-particle-opacity);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, 0) rotate(calc((var(--particle-index) - 4) * 28deg)) translateY(-172px) scale(1.08);
  }
}

.lp-club-battlepass {
  --battlepass-card-width: 132px;
  --battlepass-card-gap: 18px;
  --battlepass-card-half: calc(var(--battlepass-card-width) / 2);
  position: relative;
  display: grid;
  gap: 24px;
  min-width: 0;
  overflow: hidden;
  padding: clamp(22px, 2.4vw, 34px);
  border-color: rgba(131, 228, 236, 0.2);
  border-radius: 18px;
  background:
    radial-gradient(circle at 42% 72%, rgba(131, 228, 236, 0.12), transparent 28%),
    radial-gradient(circle at 86% 18%, rgba(208, 170, 108, 0.11), transparent 28%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 36%),
    rgba(3, 10, 12, 0.96);
  box-shadow:
    0 24px 90px rgba(0, 0, 0, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 -1px 0 rgba(131, 228, 236, 0.04);
  isolation: isolate;
}

.lp-club-battlepass::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 49.85%, rgba(131, 228, 236, 0.07) 49.85% 50.15%, transparent 50.15%),
    linear-gradient(rgba(131, 228, 236, 0.03) 1px, transparent 1px);
  background-size: auto, 100% 72px;
  opacity: 0.7;
}

.lp-club-battlepass-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.lp-club-battlepass-title {
  min-width: 0;
}

.lp-club-battlepass-title h2 {
  color: var(--text);
  font-size: clamp(30px, 3vw, 42px);
  line-height: 0.98;
  letter-spacing: 0;
}

.lp-club-battlepass-title p {
  max-width: 560px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
}

.lp-club-battlepass-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 8px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.035);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.lp-club-battlepass-help span {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(196, 224, 225, 0.35);
  border-radius: 50%;
}

.lp-club-battlepass-help:hover,
.lp-club-battlepass-help:focus-visible {
  border-color: rgba(131, 228, 236, 0.52);
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  outline: none;
  transform: translateY(-1px);
}

.lp-club-battlepass-top {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(340px, 1.25fr);
  gap: 18px;
  min-width: 0;
}

.lp-club-battlepass-season,
.lp-club-battlepass-main-reward {
  position: relative;
  overflow: hidden;
  min-height: 186px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 44%),
    rgba(2, 11, 14, 0.72);
}

.lp-club-battlepass-season {
  display: grid;
  grid-template-columns: minmax(108px, 0.72fr) minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  padding: 22px;
}

.lp-club-battlepass-season-button {
  width: 100%;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.lp-club-battlepass-season-button:hover,
.lp-club-battlepass-season-button:focus-visible {
  border-color: rgba(131, 228, 236, 0.5);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.09), transparent 48%),
    rgba(2, 11, 14, 0.82);
  box-shadow:
    0 18px 54px rgba(0, 0, 0, 0.28),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
  outline: none;
  transform: translateY(-2px);
}

.lp-club-battlepass-season-button:hover .lp-club-battlepass-emblem,
.lp-club-battlepass-season-button:focus-visible .lp-club-battlepass-emblem {
  transform: scale(1.035);
}

.lp-club-battlepass-emblem {
  display: grid;
  place-items: center;
  min-height: 116px;
  transition: transform 180ms ease;
}

.lp-club-battlepass-emblem svg {
  display: block;
  width: 88px;
  height: 88px;
  filter:
    drop-shadow(0 0 18px rgba(131, 228, 236, 0.44))
    drop-shadow(0 12px 18px rgba(0, 0, 0, 0.45));
}

.lp-club-battlepass-season-copy {
  display: grid;
  min-width: 0;
}

.lp-club-battlepass-season-copy small,
.lp-club-battlepass-main-copy small {
  color: var(--cyan);
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.lp-club-battlepass-season-copy strong {
  color: var(--text);
  font-size: clamp(23px, 2vw, 30px);
  line-height: 1;
}

.lp-club-battlepass-season-copy span {
  margin-top: 16px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.35;
}

.lp-club-battlepass-season-copy b {
  color: var(--amber);
  font-size: 18px;
}

.lp-club-battlepass-season-copy > small {
  margin-top: 12px;
  color: var(--cyan);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0;
  opacity: 0.78;
}

.lp-club-battlepass-main-reward {
  display: grid;
  grid-template-columns: minmax(190px, 0.9fr) minmax(210px, 1fr);
  align-items: center;
  gap: 12px;
  padding: 22px 24px;
  border-color: rgba(208, 170, 108, 0.46);
  background:
    radial-gradient(circle at 78% 50%, rgba(208, 170, 108, 0.2), transparent 34%),
    linear-gradient(90deg, rgba(208, 170, 108, 0.08), transparent 56%),
    rgba(10, 11, 8, 0.72);
}

.lp-club-battlepass-main-reward::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 64%, rgba(208, 170, 108, 0.1) 64% 65%, transparent 65%),
    linear-gradient(rgba(208, 170, 108, 0.08) 1px, transparent 1px);
  background-size: auto, 100% 54px;
  opacity: 0.65;
}

.lp-club-battlepass-main-copy,
.lp-club-battlepass-main-case {
  position: relative;
  z-index: 1;
}

.lp-club-battlepass-main-copy strong {
  display: block;
  margin-top: 14px;
  color: var(--text);
  font-size: clamp(25px, 2vw, 32px);
  line-height: 1.04;
}

.lp-club-battlepass-main-copy span {
  display: block;
  margin-top: 12px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
}

.lp-club-battlepass-main-copy em {
  display: block;
  margin-top: 18px;
  color: var(--amber);
  font-size: 11px;
  font-style: normal;
  font-weight: 860;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lp-club-battlepass-main-case {
  display: grid;
  place-items: center;
  min-height: 144px;
}

.lp-club-battlepass-main-case::before {
  content: "";
  position: absolute;
  width: 220px;
  height: 112px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(208, 170, 108, 0.24), transparent 66%);
  filter: blur(8px);
  transform: translateY(42px);
}

.lp-club-battlepass-main-case img {
  position: relative;
  z-index: 1;
  width: min(230px, 95%);
  max-height: 150px;
  object-fit: contain;
  filter:
    drop-shadow(0 24px 34px rgba(0, 0, 0, 0.58))
    drop-shadow(0 0 24px rgba(208, 170, 108, 0.34));
  animation: battlePassCaseHover 4.6s ease-in-out infinite;
}

.lp-club-battlepass-track {
  min-width: 0;
  overflow: hidden;
}

.lp-club-battlepass-track-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 4px 4px;
  scroll-snap-type: x proximity;
  scrollbar-color: rgba(131, 228, 236, 0.62) rgba(196, 224, 225, 0.08);
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.lp-club-battlepass-track-scroll::-webkit-scrollbar {
  height: 9px;
}

.lp-club-battlepass-track-scroll::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.08);
}

.lp-club-battlepass-track-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(90deg, var(--cyan), var(--amber));
}

.lp-club-battlepass-track-inner {
  width: max-content;
  min-width: 100%;
  padding: 4px 2px 0;
}

.lp-club-battlepass-level-rail,
.lp-club-battlepass-reward-grid {
  display: grid;
  gap: var(--battlepass-card-gap);
  width: 100%;
  min-width: max-content;
}

.lp-club-battlepass-level-rail {
  position: relative;
  margin-bottom: 34px;
  isolation: isolate;
}

.lp-club-battlepass-level-rail::before,
.lp-club-battlepass-level-rail::after {
  content: "";
  position: absolute;
  left: var(--battlepass-rail-edge, var(--battlepass-card-half));
  right: var(--battlepass-rail-edge, var(--battlepass-card-half));
  top: 28px;
  z-index: -1;
  height: 3px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.18);
}

.lp-club-battlepass-level-rail::after {
  background: linear-gradient(90deg, var(--cyan), var(--teal), var(--amber));
  box-shadow: 0 0 24px rgba(131, 228, 236, 0.46);
  transform: scaleX(var(--battlepass-line-scale, 0));
  transform-origin: left center;
}

.lp-club-battlepass-level {
  position: relative;
  display: grid;
  place-items: center;
  justify-self: center;
  width: 56px;
  height: 56px;
  border: 1px solid rgba(196, 224, 225, 0.25);
  border-radius: 50%;
  color: var(--text);
  background:
    radial-gradient(circle, rgba(131, 228, 236, 0.12), transparent 68%),
    #03090b;
  box-shadow:
    0 0 0 5px rgba(0, 0, 0, 0.42),
    inset 0 0 0 4px rgba(196, 224, 225, 0.05);
  cursor: pointer;
  font: inherit;
  font-size: 21px;
  font-weight: 860;
  transition:
    border-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.lp-club-battlepass-level:hover,
.lp-club-battlepass-level:focus-visible,
.lp-club-battlepass-level.is-active {
  border-color: rgba(131, 228, 236, 0.96);
  color: var(--cyan);
  background:
    radial-gradient(circle, rgba(131, 228, 236, 0.35), transparent 66%),
    #061113;
  box-shadow:
    0 0 0 5px rgba(131, 228, 236, 0.1),
    0 0 42px rgba(131, 228, 236, 0.46),
    inset 0 0 0 4px rgba(131, 228, 236, 0.08);
  outline: none;
  transform: translateY(-1px);
}

.lp-club-battlepass-level.is-done {
  border-color: rgba(148, 214, 184, 0.42);
  color: var(--good);
}

.lp-club-battlepass-level.is-active::after {
  content: "";
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 18px solid var(--cyan);
  filter: drop-shadow(0 0 14px rgba(131, 228, 236, 0.72));
  transform: translateX(-50%);
}

.lp-club-battlepass-reward {
  --rank: #b7c4c6;
  --rank-line: rgba(196, 224, 225, 0.2);
  --rank-glow: rgba(196, 224, 225, 0.08);
  position: relative;
  display: grid;
  grid-template-rows: minmax(82px, 1fr) auto;
  align-items: end;
  justify-self: center;
  width: 100%;
  max-width: 158px;
  min-width: var(--battlepass-card-width);
  min-height: 204px;
  padding: 18px 13px 15px;
  border: 1px solid var(--rank-line);
  border-radius: 10px;
  color: var(--text);
  text-align: center;
  background:
    radial-gradient(circle at 50% 39%, var(--rank-glow), transparent 62%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 58%),
    rgba(2, 8, 10, 0.83);
  cursor: pointer;
  scroll-snap-align: center;
  transition:
    border-color 210ms ease,
    box-shadow 210ms ease,
    opacity 210ms ease,
    transform 210ms ease;
}

.lp-club-battlepass-reward::before {
  content: attr(data-status);
  position: absolute;
  top: 9px;
  left: 9px;
  min-width: 48px;
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  color: var(--rank);
  background: rgba(0, 0, 0, 0.36);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lp-club-battlepass-reward[data-rank="rare"] {
  --rank: var(--cyan);
  --rank-line: rgba(131, 228, 236, 0.42);
  --rank-glow: rgba(131, 228, 236, 0.18);
}

.lp-club-battlepass-reward[data-rank="epic"] {
  --rank: #9a80ff;
  --rank-line: rgba(154, 128, 255, 0.46);
  --rank-glow: rgba(154, 128, 255, 0.2);
}

.lp-club-battlepass-reward[data-rank="legendary"] {
  --rank: var(--amber);
  --rank-line: rgba(208, 170, 108, 0.52);
  --rank-glow: rgba(208, 170, 108, 0.22);
}

.lp-club-battlepass-reward:hover,
.lp-club-battlepass-reward:focus-visible,
.lp-club-battlepass-reward.is-active {
  border-color: var(--rank);
  box-shadow:
    0 20px 58px rgba(0, 0, 0, 0.36),
    0 0 34px var(--rank-glow),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  outline: none;
  transform: translateY(-6px);
}

.lp-club-battlepass-reward.is-active::after {
  content: "";
  position: absolute;
  inset: -1px;
  border: 1px solid var(--rank);
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.08),
    0 0 32px var(--rank-glow);
  pointer-events: none;
  animation: battlePassActivePulse 2.2s ease-in-out infinite;
}

.lp-club-battlepass-reward.is-locked {
  opacity: 0.62;
}

.lp-club-battlepass-reward.is-ready::before {
  color: #031114;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
}

.lp-club-battlepass-reward-media {
  align-self: center;
  justify-self: center;
  display: grid;
  place-items: center;
  width: 104px;
  height: 88px;
  margin-top: 22px;
  color: var(--rank);
  filter: drop-shadow(0 0 18px var(--rank-glow));
}

.lp-club-battlepass-reward-media img {
  width: 112px;
  height: 84px;
  object-fit: contain;
  filter:
    drop-shadow(0 16px 20px rgba(0, 0, 0, 0.54))
    drop-shadow(0 0 20px var(--rank-glow));
}

.lp-club-battlepass-reward.is-active .lp-club-battlepass-reward-media img {
  animation: battlePassCaseCardFloat 3.2s ease-in-out infinite;
}

.lp-club-battlepass-token {
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  overflow: hidden;
  padding: 8px;
  border: 1px solid var(--rank-line);
  border-radius: 50%;
  color: var(--rank);
  text-align: center;
  background:
    radial-gradient(circle, var(--rank-glow), transparent 68%),
    rgba(0, 0, 0, 0.28);
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
}

.lp-club-battlepass-token > span {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.lp-club-battlepass-token[data-density="long"] {
  padding: 10px;
  font-size: 7.5px;
  font-weight: 720;
  line-height: 1.06;
  letter-spacing: 0;
}

.lp-club-battlepass-token[data-density="medium"] {
  padding: 9px;
  font-size: 10.5px;
  font-weight: 820;
  line-height: 1.06;
  letter-spacing: 0;
}

.lp-club-battlepass-token[data-density="medium"] > span,
.lp-club-battlepass-token[data-density="long"] > span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
}

.lp-club-battlepass-token[data-density="medium"] > span {
  -webkit-line-clamp: 4;
}

.lp-club-battlepass-token[data-density="long"] > span {
  -webkit-line-clamp: 5;
}

.lp-club-battlepass-token[data-type="discount"] {
  font-size: 15px;
}

.lp-club-battlepass-reward-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.lp-club-battlepass-reward-copy strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text);
  font-size: 9.5px;
  font-weight: 720;
  line-height: 1.12;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.lp-club-battlepass-reward-copy small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--quiet);
  font-size: 7.5px;
  font-weight: 680;
  line-height: 1.22;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.lp-club-battlepass-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: min(100%, 420px);
  margin-top: 22px;
}

.lp-club-battlepass-meter {
  position: relative;
  overflow: hidden;
  height: 11px;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.055);
}

.lp-club-battlepass-meter i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal), var(--amber));
  box-shadow: 0 0 22px rgba(131, 228, 236, 0.4);
}

.lp-club-battlepass-progress-copy {
  display: grid;
  justify-items: end;
  gap: 3px;
  min-width: 0;
  max-width: none;
  color: var(--cyan);
  text-align: right;
}

.lp-club-battlepass-progress-copy strong {
  font-size: 14px;
  font-weight: 860;
  letter-spacing: 0.1em;
}

.lp-club-battlepass-progress-copy small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  font-weight: 760;
  line-height: 1.18;
  letter-spacing: 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@keyframes battlePassCaseHover {
  0%,
  100% {
    transform: translateY(0) rotate(-1deg);
  }

  50% {
    transform: translateY(-7px) rotate(1deg);
  }
}

@keyframes battlePassCaseCardFloat {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(-5px) scale(1.03);
  }
}

@keyframes battlePassActivePulse {
  0%,
  100% {
    opacity: 0.68;
  }

  50% {
    opacity: 1;
  }
}
.lp-club-profile-panel {
  align-self: start;
  min-height: 100%;
}

.lp-club-profile-logo {
  display: grid;
  min-height: 40px;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 13px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-profile-copy {
  min-width: 0;
}

.lp-club-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(131, 228, 236, 0.4);
  border-radius: 50%;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.06);
}

.lp-club-avatar.is-custom-logo {
  overflow: visible;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.lp-club-avatar.is-custom-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.lp-club-profile-logo strong {
  display: block;
  color: var(--text);
  font-size: 15px;
  line-height: 1.18;
}

.lp-club-nickname-button {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.lp-club-nickname-button:focus-visible {
  outline: 2px solid rgba(131, 228, 236, 0.8);
  outline-offset: 5px;
  border-radius: 6px;
}

.lp-club-profile-logo span span {
  display: block;
  margin-top: 7px;
  color: var(--quiet);
  font-size: 10px;
  font-weight: 820;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.lp-club-profile-logo .lp-club-nickname-title {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 7px;
  vertical-align: top;
}

.lp-club-nickname-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-club-nickname-title svg {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  color: var(--cyan);
  filter: drop-shadow(0 0 8px rgba(131, 228, 236, 0.34));
}

.lp-club-nickname-button .lp-club-profile-contact,
.lp-club-nickname-editor .lp-club-profile-contact {
  display: block;
  margin-top: 6px;
  color: rgba(168, 185, 186, 0.88);
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0.06em;
  text-transform: none;
}

.lp-club-nickname-editor {
  display: block;
  min-width: 0;
}

.lp-club-nickname-editor input {
  display: block;
  width: 100%;
  min-width: 0;
  margin-top: 7px;
  padding: 9px 10px;
  border: 1px solid rgba(131, 228, 236, 0.42);
  border-radius: 7px;
  color: var(--text);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.2;
  background: rgba(0, 8, 12, 0.72);
  box-shadow: 0 0 0 3px rgba(131, 228, 236, 0.08);
}

.lp-club-nickname-editor input:focus {
  outline: none;
  border-color: rgba(131, 228, 236, 0.82);
}

.lp-club-nickname-editor input:disabled {
  opacity: 0.7;
}

.lp-club-profile-section {
  padding: 17px 0;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.lp-club-profile-row strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1;
}

.lp-club-progress {
  height: 10px;
  overflow: hidden;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 999px;
  background: rgba(0, 6, 9, 0.72);
}

.lp-club-progress span {
  display: block;
  width: var(--value);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--teal));
  box-shadow: 0 0 20px rgba(131, 228, 236, 0.34);
}

.lp-club-level-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 7px 12px;
  margin-top: 9px;
  color: var(--quiet);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lp-club-reward-wallet {
  position: relative;
  display: grid;
  gap: 10px;
  overflow: hidden;
  margin: 16px 0 0;
  padding: 14px;
  border: 1px solid rgba(131, 228, 236, 0.58);
  border-radius: 9px;
  background:
    radial-gradient(circle at 0 0, rgba(131, 228, 236, 0.14), transparent 42%),
    rgba(4, 15, 18, 0.88);
  box-shadow:
    inset 3px 0 0 rgba(131, 228, 236, 0.18),
    0 0 26px rgba(131, 228, 236, 0.07);
}

.lp-club-reward-wallet::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 72%;
  height: 1px;
  background: linear-gradient(90deg, var(--cyan), transparent);
}

.lp-club-reward-wallet-head {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.lp-club-reward-wallet-head > strong {
  color: var(--cyan);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1.2;
  text-transform: uppercase;
}

.lp-club-reward-wallet-icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid rgba(131, 228, 236, 0.3);
  border-radius: 7px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.06);
}

.lp-club-reward-wallet-icon svg,
.lp-club-reward-wallet-icon img {
  width: 15px;
  height: 15px;
  object-fit: contain;
}

.lp-club-reward-wallet-count {
  display: grid;
  min-width: 26px;
  height: 22px;
  place-items: center;
  padding: 0 7px;
  border-radius: 999px;
  color: #fff2c8;
  font-size: 10px;
  font-weight: 900;
  background: rgba(152, 116, 17, 0.78);
}

.lp-club-reward-wallet > p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

.lp-club-reward-wallet-primary,
.lp-club-reward-wallet-history {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.07em;
  text-align: center;
  text-decoration: none;
  text-transform: uppercase;
}

.lp-club-reward-wallet-primary {
  border: 1px solid rgba(131, 228, 236, 0.42);
  color: #001012;
  cursor: pointer;
  background: linear-gradient(135deg, #83e4ec, #94d6b8);
}

.lp-club-reward-wallet-history {
  border: 1px solid rgba(131, 228, 236, 0.2);
  color: var(--cyan);
  background: rgba(196, 224, 225, 0.025);
}

.lp-club-reward-wallet-history.is-standalone {
  margin-top: 16px;
}

.lp-club-reward-wallet > small {
  color: var(--quiet);
  font-size: 9px;
  line-height: 1.3;
  text-align: center;
}

.lp-club-reward-wallet.is-pulsing {
  animation: lp-reward-wallet-pulse 1050ms ease-out 1;
}

@keyframes lp-reward-wallet-pulse {
  0% {
    box-shadow: 0 0 0 rgba(131, 228, 236, 0);
  }

  38% {
    box-shadow:
      0 0 0 4px rgba(131, 228, 236, 0.1),
      0 0 34px rgba(131, 228, 236, 0.3);
  }

  100% {
    box-shadow: 0 0 0 rgba(131, 228, 236, 0);
  }
}

.lp-club-checkin-pending {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  padding: 5px 8px;
  border: 1px solid rgba(218, 171, 50, 0.3);
  border-radius: 999px;
  color: #f2ce70;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(152, 116, 17, 0.1);
}

.lp-club-checkin-card {
  display: grid;
  gap: 8px;
  padding: 16px 0 18px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-checkin-card strong {
  color: var(--text);
  font-size: 15px;
  line-height: 1.2;
}

.lp-club-checkin-card p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

.lp-club-checkin-card button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(131, 228, 236, 0.4);
  border-radius: 7px;
  color: #001012;
  cursor: pointer;
  font-size: 11px;
  font-weight: 860;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
  background: linear-gradient(135deg, #83e4ec, #94d6b8);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.lp-club-checkin-card button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.lp-club-checkin-card button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.lp-club-promo {
  display: grid;
  gap: 10px;
  padding-top: 17px;
}

.lp-club-promo input {
  width: 100%;
  height: 46px;
  min-width: 0;
  padding: 0 12px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  outline: 0;
  color: var(--text);
  background: rgba(0, 6, 9, 0.68);
  font-size: 13px;
}

.lp-club-promo input:focus {
  border-color: rgba(131, 228, 236, 0.58);
  box-shadow: 0 0 0 3px rgba(131, 228, 236, 0.08);
}

.lp-club-promo button,
.lp-club-primary-link,
.lp-club-ghost-link {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 860;
  letter-spacing: 0.08em;
  text-align: center;
  text-decoration: none;
  text-transform: uppercase;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.lp-club-promo button,
.lp-club-primary-link {
  border: 1px solid rgba(131, 228, 236, 0.4);
  color: #001012;
  background: linear-gradient(135deg, #83e4ec, #94d6b8);
}

.lp-club-promo button:hover,
.lp-club-primary-link:hover {
  transform: translateY(-1px);
}

.lp-club-side-link,
.lp-club-ghost-link {
  color: var(--cyan);
  border: 1px solid rgba(131, 228, 236, 0.22);
  background: rgba(196, 224, 225, 0.035);
}

.lp-club-side-link {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.lp-club-quest-widget {
  margin-top: 18px;
  padding-top: 17px;
  border-top: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-quest-widget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-club-quest-widget-head strong {
  display: block;
  margin-top: 6px;
  color: var(--text);
  font-size: 14px;
}

.lp-club-quest-count {
  border-radius: 999px;
  padding: 6px 8px;
  color: var(--cyan);
  background: rgba(131, 228, 236, 0.08);
  font-size: 10px;
  font-weight: 860;
}

.lp-club-side-quest-list {
  display: grid;
  gap: 10px;
  min-width: 0;
  margin-top: 14px;
}

.lp-club-side-quest,
.lp-club-quest-full-card {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  text-decoration: none;
  background: transparent;
}

.lp-club-side-quest-claim {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 1px solid rgba(131, 228, 236, 0.34);
  border-radius: 999px;
  color: var(--cyan);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  background: rgba(5, 18, 21, 0.92);
  box-shadow: 0 0 18px rgba(131, 228, 236, 0.12);
  pointer-events: none;
}

.lp-club-side-quest.has-wallet-reward p.truncate,
.lp-club-quest-full-card.has-wallet-reward p.truncate {
  padding-right: 62px;
}

.lp-club-side-quest > div,
.lp-club-quest-full-card > div {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  transition:
    filter 180ms ease,
    transform 180ms ease;
}

.lp-club-side-quest:hover > div,
.lp-club-side-quest.is-current > div,
.lp-club-quest-full-card:hover > div,
.lp-club-quest-full-card.is-current > div {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.lp-club-side-quest.is-done > div,
.lp-club-quest-full-card.is-done > div {
  filter: saturate(0.8);
}

.lp-club-side-quest:focus-visible,
.lp-club-quest-full-card:focus-visible {
  outline: none;
}

.lp-club-side-quest:focus-visible > div,
.lp-club-quest-full-card:focus-visible > div {
  outline: 2px solid var(--cyan);
  outline-offset: 4px;
}

.lp-club-quest-widget-actions {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.lp-club-quest-open-button,
.lp-club-quest-board-close {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  color: var(--cyan);
  cursor: pointer;
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  background: rgba(196, 224, 225, 0.04);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.lp-club-quest-open-button:hover,
.lp-club-quest-open-button:focus-visible,
.lp-club-quest-board-close:hover,
.lp-club-quest-board-close:focus-visible {
  border-color: rgba(131, 228, 236, 0.58);
  background: rgba(131, 228, 236, 0.08);
  outline: none;
  transform: translateY(-1px);
}

.lp-club-quest-empty,
.lp-club-quest-group-empty {
  margin: 0;
  padding: 12px;
  border: 1px dashed rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  background: rgba(2, 8, 11, 0.36);
}

.lp-club-quest-board {
  position: absolute;
  top: var(--quest-board-top, 298px);
  right: var(--quest-board-right, 300px);
  bottom: var(--quest-board-bottom, 32px);
  left: var(--quest-board-left, 18px);
  z-index: 8;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
  padding: 20px;
  border: 1px solid rgba(131, 228, 236, 0.32);
  border-radius: var(--radius);
  opacity: 0;
  pointer-events: none;
  clip-path: inset(0 0 0 100% round 8px);
  transform-origin: right center;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 28%),
    rgba(5, 12, 15, 0.96);
  box-shadow:
    0 34px 110px rgba(0, 0, 0, 0.66),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
  transition:
    opacity 260ms ease,
    clip-path 360ms cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lp-club-quest-board::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 49.8%, rgba(131, 228, 236, 0.08) 49.8% 50%, transparent 50%),
    linear-gradient(rgba(196, 224, 225, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(196, 224, 225, 0.035) 1px, transparent 1px);
  background-size: auto, 82px 82px, 82px 82px;
  mask-image: radial-gradient(circle at 70% 48%, #000, transparent 82%);
}

.lp-club-quest-board.is-open {
  opacity: 1;
  pointer-events: auto;
  clip-path: inset(0 0 0 0 round 8px);
}

.lp-club-shell.is-quests-expanded .lp-club-lootboxes,
.lp-club-shell.is-quests-expanded .lp-club-battlepass {
  opacity: 0.18;
  filter: blur(1.5px);
  pointer-events: none;
}

.lp-club-quest-board-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.12);
}

.lp-club-quest-board-head h2 {
  margin-top: 7px;
  color: var(--text);
  font-size: clamp(28px, 3vw, 42px);
  line-height: 0.98;
  font-weight: 760;
}

.lp-club-quest-board-head p {
  max-width: 560px;
  margin-top: 9px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.lp-club-quest-board-list {
  position: relative;
  z-index: 1;
  display: grid;
  align-content: start;
  gap: 16px;
  min-height: 0;
  overflow: auto;
  padding-right: 8px;
  scrollbar-color: rgba(131, 228, 236, 0.58) rgba(196, 224, 225, 0.08);
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.lp-club-quest-board-list::-webkit-scrollbar {
  width: 10px;
}

.lp-club-quest-board-list::-webkit-scrollbar-track {
  border: 1px solid rgba(196, 224, 225, 0.08);
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.055);
}

.lp-club-quest-board-list::-webkit-scrollbar-thumb {
  border: 2px solid rgba(5, 12, 15, 0.96);
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(131, 228, 236, 0.98), rgba(84, 191, 198, 0.58));
  box-shadow: 0 0 18px rgba(131, 228, 236, 0.34);
}

.lp-club-quest-group {
  display: grid;
  gap: 8px;
}

.lp-club-quest-group-head {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-club-quest-group-head strong {
  color: var(--text);
  font-size: 13px;
  font-weight: 820;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lp-club-quest-group-head span {
  color: var(--quiet);
  font-size: 9px;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.lp-club-quest-board-pagination {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 4px 0 8px;
}

.lp-club-quest-board-pagination p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
}

.lp-club-quest-board-pagination p[role="alert"] {
  color: #f1b8b8;
}

.lp-club-quest-board-load-more {
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(131, 228, 236, 0.42);
  border-radius: 8px;
  color: var(--cyan);
  cursor: pointer;
  font-size: 10px;
  font-weight: 860;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: rgba(131, 228, 236, 0.08);
}

.lp-club-quest-board-load-more:hover:not(:disabled),
.lp-club-quest-board-load-more:focus-visible {
  border-color: rgba(131, 228, 236, 0.82);
  background: rgba(131, 228, 236, 0.16);
  outline: none;
}

.lp-club-quest-board-load-more:disabled {
  cursor: wait;
  opacity: 0.64;
}

.lp-club-quest-full-card {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  background: transparent;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.lp-reward-standalone-page {
  min-height: 100vh;
}

.lp-reward-standalone-shell {
  display: grid;
  gap: 16px;
  width: min(1480px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: clamp(18px, 3.4vw, 46px);
}

.lp-reward-wallet-message {
  padding: 12px 14px;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: 8px;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 760;
  background: rgba(131, 228, 236, 0.07);
}

.lp-reward-wallet-inbox {
  display: grid;
  gap: 16px;
  overflow: hidden;
  padding: clamp(18px, 2.4vw, 28px);
  border-color: rgba(131, 228, 236, 0.42);
  background:
    radial-gradient(circle at 0 0, rgba(131, 228, 236, 0.13), transparent 34%),
    linear-gradient(180deg, rgba(7, 16, 19, 0.98), rgba(3, 9, 11, 0.98));
}

.lp-reward-wallet-inbox-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 18px;
}

.lp-reward-wallet-inbox-head h1 {
  margin-top: 9px;
  color: var(--text);
  font-size: clamp(25px, 3vw, 42px);
  line-height: 1;
}

.lp-reward-wallet-inbox-head p {
  max-width: 700px;
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.lp-reward-wallet-inbox-count {
  display: grid;
  min-width: 42px;
  height: 36px;
  place-items: center;
  padding: 0 10px;
  border-radius: 999px;
  color: #fff2c8;
  font-size: 15px;
  font-weight: 900;
  background: rgba(152, 116, 17, 0.78);
  box-shadow: 0 0 24px rgba(218, 171, 50, 0.16);
}

.lp-reward-wallet-inbox-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.lp-reward-wallet-inbox-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 13px;
  border: 1px solid rgba(196, 224, 225, 0.13);
  border-radius: 9px;
  background: rgba(196, 224, 225, 0.035);
}

.lp-reward-wallet-inbox-item.is-failed {
  border-color: rgba(251, 113, 133, 0.42);
  background: rgba(159, 18, 57, 0.09);
}

.lp-reward-wallet-inbox-item > .lp-reward-wallet-item-icon {
  width: 42px;
  height: 42px;
}

.lp-reward-wallet-inbox-item > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.lp-reward-wallet-inbox-item small,
.lp-reward-wallet-inbox-item em {
  color: var(--muted);
  font-size: 10px;
  font-style: normal;
}

.lp-reward-wallet-inbox-item .lp-reward-wallet-item-status {
  color: var(--cyan);
  font-weight: 800;
}

.lp-reward-wallet-inbox-item .lp-reward-wallet-item-hint {
  overflow: visible;
  color: rgba(196, 224, 225, 0.68);
  line-height: 1.35;
  white-space: normal;
}

.lp-reward-wallet-inbox-item.is-failed .lp-reward-wallet-item-hint {
  color: #fda4af;
}

.lp-reward-wallet-inbox-item strong,
.lp-reward-wallet-inbox-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-reward-wallet-inbox-item strong {
  color: var(--text);
  font-size: 13px;
}

.lp-reward-wallet-inbox-item > div > span {
  color: var(--cyan);
  font-size: 12px;
  font-weight: 800;
}

.lp-reward-wallet-inbox-item > button,
.lp-reward-wallet-inbox-actions > button {
  appearance: none;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(131, 228, 236, 0.42);
  border-radius: 7px;
  color: #001012;
  cursor: pointer;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: linear-gradient(135deg, #83e4ec, #94d6b8);
}

.lp-reward-wallet-inbox-item > button:disabled,
.lp-reward-wallet-inbox-actions > button:disabled {
  cursor: wait;
  opacity: 0.62;
}

.lp-reward-wallet-inbox-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(196, 224, 225, 0.1);
}

.lp-reward-wallet-inbox-more {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  text-align: center;
}

.lp-reward-wallet-inbox-actions > button {
  min-height: 42px;
  padding: 0 18px;
}

.lp-reward-wallet-inbox-actions > span {
  color: var(--quiet);
  font-size: 10px;
}

.lp-reward-journal {
  display: grid;
  gap: 24px;
  align-content: start;
  min-width: 0;
  padding: clamp(24px, 3vw, 42px);
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.055), transparent 32%),
    linear-gradient(180deg, rgba(8, 17, 21, 0.98), rgba(3, 9, 12, 0.98));
}

.lp-reward-journal.is-standalone {
  min-height: min(760px, calc(100vh - clamp(36px, 6.8vw, 92px)));
}

.lp-reward-journal::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.42;
  background:
    linear-gradient(rgba(196, 224, 225, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(196, 224, 225, 0.018) 1px, transparent 1px);
  background-size: 76px 76px;
  mask-image: radial-gradient(circle at 50% 42%, #000, transparent 84%);
}

.lp-reward-journal > * {
  position: relative;
  z-index: 1;
}

.lp-reward-journal-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: start;
  padding-bottom: 22px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.11);
}

.lp-reward-journal-title {
  display: grid;
  justify-items: start;
}

.lp-reward-back-link {
  display: inline-flex;
  width: fit-content;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  color: var(--cyan);
  font-size: 10px;
  font-weight: 840;
  letter-spacing: 0.09em;
  line-height: 1;
  text-decoration: none;
  text-transform: uppercase;
  white-space: nowrap;
  transition: color 160ms ease;
}

.lp-reward-back-link:hover,
.lp-reward-back-link:focus-visible {
  color: #c7f8fc;
  outline: none;
}

.lp-reward-back-link svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.lp-reward-journal-head h2 {
  margin-top: 12px;
  color: var(--text);
  font-size: clamp(34px, 3.6vw, 52px);
  font-weight: 780;
  line-height: 0.98;
  letter-spacing: -0.035em;
}

.lp-reward-journal-head p {
  margin-top: 12px;
  color: #b8c8ca;
  font-size: 14px;
  line-height: 1.55;
}

.lp-reward-sync-pill {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 820;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  background: rgba(7, 12, 16, 0.46);
  white-space: nowrap;
}

.lp-reward-sync-pill::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 12px rgba(131, 228, 236, 0.48);
}

.lp-reward-filter-panel {
  display: grid;
  grid-template-columns:
    minmax(170px, 0.85fr)
    minmax(190px, 1fr)
    minmax(360px, 2.2fr)
    minmax(140px, 0.68fr)
    auto;
  gap: 14px;
  align-items: end;
  padding: 16px;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: 10px;
  background: rgba(196, 224, 225, 0.025);
}

.lp-reward-scope-field,
.lp-reward-search,
.lp-reward-rarity-field,
.lp-reward-source-filter {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.lp-reward-filter-panel .lp-club-small-label {
  color: rgba(196, 224, 225, 0.62);
  font-size: 9px;
  letter-spacing: 0.12em;
}

.lp-club-switch .lp-club-brand-mark {
  width: 30px;
  height: 30px;
}

.lp-reward-scope-field select,
.lp-reward-search input,
.lp-reward-rarity-field select {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 740;
  background: rgba(0, 0, 0, 0.24);
  outline: none;
}

.lp-reward-scope-field select,
.lp-reward-rarity-field select {
  padding: 0 36px 0 12px;
}

.lp-reward-search input {
  padding: 0 12px;
}

.lp-reward-scope-field option,
.lp-reward-rarity-field option {
  color: var(--text);
  background: #071014;
}

.lp-reward-scope-field select:focus,
.lp-reward-search input:focus,
.lp-reward-rarity-field select:focus {
  border-color: rgba(131, 228, 236, 0.56);
  box-shadow: 0 0 0 3px rgba(131, 228, 236, 0.07);
}

.lp-reward-source-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lp-reward-source-options button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid rgba(196, 224, 225, 0.13);
  border-radius: 7px;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  background: rgba(196, 224, 225, 0.025);
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease;
}

.lp-reward-source-options button span {
  color: var(--quiet);
  font-size: 9px;
}

.lp-reward-source-options button:hover,
.lp-reward-source-options button:focus-visible,
.lp-reward-source-options button.is-active {
  border-color: rgba(131, 228, 236, 0.58);
  color: var(--text);
  background: rgba(131, 228, 236, 0.08);
  outline: none;
}

.lp-reward-source-options button.is-active span {
  color: var(--cyan);
}

.lp-reward-reset {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid rgba(196, 224, 225, 0.13);
  border-radius: 7px;
  color: var(--cyan);
  cursor: pointer;
  font: inherit;
  font-size: 9px;
  font-weight: 840;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  background: transparent;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    opacity 160ms ease;
}

.lp-reward-reset svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.lp-reward-reset:hover:not(:disabled),
.lp-reward-reset:focus-visible {
  border-color: rgba(131, 228, 236, 0.58);
  background: rgba(131, 228, 236, 0.07);
  outline: none;
}

.lp-reward-reset:disabled {
  cursor: default;
  opacity: 0.34;
}

.lp-reward-list-panel {
  min-width: 0;
}

.lp-reward-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-reward-group-head h3 {
  color: var(--text);
  font-size: 11px;
  font-weight: 840;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lp-reward-list {
  display: grid;
  gap: 18px;
}

.lp-reward-group {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.lp-reward-group-head {
  min-height: 24px;
  padding: 0;
}

.lp-reward-group-entries {
  position: relative;
  min-width: 0;
  margin-left: 24px;
  border: 1px solid rgba(196, 224, 225, 0.12);
  border-radius: 7px;
  background: rgba(2, 8, 11, 0.22);
}

.lp-reward-group-entries::before {
  position: absolute;
  top: 24px;
  bottom: 24px;
  left: -17px;
  width: 1px;
  background: rgba(158, 181, 183, 0.34);
  content: "";
}

.lp-reward-achievement-card {
  --rarity: #9eb5b7;
  --source-tone: 131 228 236;
  position: relative;
  display: grid;
  grid-template-columns: 132px 160px minmax(180px, 1fr) 150px auto;
  grid-template-areas: "time source reward rarity value";
  gap: 16px;
  align-items: center;
  min-width: 0;
  min-height: 48px;
  padding: 7px 16px 7px 24px;
  border-bottom: 1px solid rgba(196, 224, 225, 0.09);
  background: transparent;
  transition: background 160ms ease;
}

.lp-reward-achievement-card:last-child {
  border-bottom: 0;
}

.lp-reward-achievement-card:hover {
  background: rgba(131, 228, 236, 0.035);
}

.lp-reward-achievement-card.rarity-common {
  --rarity: #9eb5b7;
}

.lp-reward-achievement-card.rarity-rare {
  --rarity: #83e4ec;
}

.lp-reward-achievement-card.rarity-epic {
  --rarity: #afa4ff;
}

.lp-reward-achievement-card.rarity-legendary {
  --rarity: #d0aa6c;
}

.lp-reward-achievement-time {
  grid-area: time;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.lp-reward-timeline-dot {
  position: absolute;
  top: 50%;
  left: -23px;
  width: 11px;
  height: 11px;
  border: 2px solid rgba(213, 232, 233, 0.78);
  border-radius: 50%;
  background: #60757a;
  box-shadow: 0 0 0 3px #071014;
  transform: translateY(-50%);
}

.lp-reward-achievement-source,
.lp-reward-rarity-label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}

.lp-reward-achievement-source {
  grid-area: source;
}

.lp-reward-achievement-source > span,
.lp-reward-rarity-label > span {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--source-tone));
}

.lp-reward-rarity-label {
  grid-area: rarity;
  color: var(--rarity);
}

.lp-reward-rarity-label > span {
  background: var(--rarity);
}

.lp-reward-achievement-main {
  grid-area: reward;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.lp-reward-achievement-main strong {
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: 13px;
  line-height: 1.3;
}

.lp-reward-value {
  grid-area: value;
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  padding: 0 10px;
  border: 1px solid rgba(196, 224, 225, 0.15);
  color: var(--text);
  font-size: 10px;
  font-weight: 840;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.035);
}

.lp-reward-load-more {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  justify-self: center;
  margin-top: 2px;
  padding: 0 18px;
  border: 1px solid rgba(196, 224, 225, 0.16);
  border-radius: 7px;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 820;
  background: rgba(196, 224, 225, 0.035);
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.lp-reward-load-more:hover,
.lp-reward-load-more:focus-visible {
  border-color: rgba(131, 228, 236, 0.52);
  background: rgba(131, 228, 236, 0.08);
  outline: none;
}

.lp-reward-load-more svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.lp-reward-empty-copy {
  padding: 28px 18px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  text-align: center;
}

@media (max-width: 1260px) {
  .lp-reward-filter-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lp-reward-source-filter {
    grid-column: 1 / -1;
  }

  .lp-reward-reset {
    justify-self: start;
  }

  .lp-reward-achievement-card {
    grid-template-columns: 92px 136px minmax(160px, 1fr) 124px auto;
    gap: 12px;
  }
}

@media (max-width: 980px) {
  .lp-reward-achievement-card {
    grid-template-columns: 74px 126px minmax(0, 1fr) auto;
    grid-template-areas:
      "time source reward value"
      "time source rarity value";
    row-gap: 3px;
  }
}

@media (max-width: 760px) {
  .lp-reward-journal-head,
  .lp-reward-filter-panel {
    grid-template-columns: 1fr;
  }

  .lp-reward-sync-pill {
    justify-self: start;
  }

  .lp-reward-source-filter {
    grid-column: auto;
  }

  .lp-reward-reset {
    width: 100%;
  }

  .lp-reward-achievement-card {
    grid-template-columns: 58px minmax(0, 1fr) auto;
    grid-template-areas:
      "time source value"
      ". reward reward"
      ". rarity rarity";
    gap: 5px 10px;
    min-height: 72px;
    padding: 10px 12px 10px 16px;
  }
}

@media (max-width: 520px) {
  .lp-reward-journal {
    gap: 18px;
    padding: 16px;
  }

  .lp-reward-journal-head h2 {
    font-size: 34px;
  }

  .lp-reward-filter-panel {
    padding: 12px;
  }

  .lp-reward-source-options button {
    min-height: 38px;
    padding: 0 9px;
  }

  .lp-reward-group-entries {
    margin-left: 18px;
  }

  .lp-reward-group-entries::before {
    left: -13px;
  }

  .lp-reward-achievement-card {
    grid-template-columns: 52px minmax(0, 1fr);
    grid-template-areas:
      "time source"
      ". reward"
      ". rarity"
      ". value";
    gap: 6px 8px;
    padding: 10px 10px 10px 14px;
  }

  .lp-reward-timeline-dot {
    left: -19px;
  }

  .lp-reward-achievement-main {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .lp-reward-value {
    justify-self: start;
  }
}
.lp-club-detail-stack {
  display: grid;
  gap: 18px;
  width: min(1480px, 100%);
  margin: 0 auto;
  padding: 4px clamp(18px, 3.4vw, 46px) 48px;
}

.lp-club-detail-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  padding-top: 10px;
}

.lp-club-toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 18px;
  z-index: 20;
  max-width: 420px;
  margin: 0 auto;
  padding: 13px 14px;
  border: 1px solid rgba(131, 228, 236, 0.28);
  border-radius: 7px;
  background: rgba(7, 13, 16, 0.94);
  color: #d7e5e6;
  box-shadow: var(--shadow);
  font-size: 13px;
  line-height: 1.45;
  opacity: 0;
  transform: translateY(12px);
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  backdrop-filter: blur(18px);
}

.lp-club-toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.lp-club-home-static {
  --panel: rgba(8, 14, 18, 0.9);
  --line: rgba(196, 224, 225, 0.18);
  --cyan: #83e4ec;
  --text: #edf7f8;
  --muted: #a8b9ba;
  --radius: 8px;
  --shadow: 0 30px 90px rgba(0, 0, 0, 0.48);
  position: relative;
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  isolation: isolate;
  background:
    radial-gradient(circle at 72% 8%, rgba(131, 228, 236, 0.08), transparent 28%),
    #000;
}

.lp-club-static-card {
  width: min(560px, 100%);
  padding: 26px;
}

.lp-club-static-title {
  margin-top: 12px;
  color: var(--text);
  font-size: clamp(28px, 6vw, 44px);
  line-height: 1;
  font-weight: 780;
}

.lp-club-static-copy {
  margin-top: 14px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.65;
}

.lp-club-static-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.lp-club-static-actions > .lp-club-primary-link,
.lp-club-static-actions > .lp-club-ghost-link {
  padding: 0 14px;
}

.lp-club-static-actions > button {
  cursor: pointer;
}

.lp-club-skeleton {
  height: 12px;
  border-radius: 999px;
  background: rgba(196, 224, 225, 0.12);
}

.lp-club-skeleton + .lp-club-skeleton {
  margin-top: 12px;
}

.lp-club-skeleton-short {
  width: 120px;
}

.lp-club-skeleton-title {
  width: 68%;
  height: 42px;
  margin-top: 18px;
}

.lp-club-skeleton-mid {
  width: 76%;
}

.lp-club-static-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 24px;
}

.lp-club-static-grid .lp-club-skeleton {
  height: 64px;
  margin-top: 0;
  border-radius: 8px;
}

@media (max-width: 1320px) {
  .lp-club-shell {
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 16px;
    padding-right: clamp(16px, 2vw, 28px);
    padding-left: clamp(16px, 2vw, 28px);
  }

  .lp-club-stage {
    display: block;
  }

  .lp-club-card {
    min-height: 230px;
    padding: 20px;
  }

  .lp-club-card h1 {
    margin-top: 28px;
    font-size: 54px;
    line-height: 0.94;
  }

  .lp-club-card p {
    margin-top: 16px;
    font-size: 14px;
    line-height: 1.55;
  }

  .lp-club-quick-metrics {
    gap: 10px;
    margin-top: 22px;
  }

  .lp-club-metric {
    min-width: 76px;
    padding: 10px;
  }

  .lp-club-banner-grid {
    gap: 14px;
  }

  .lp-club-banner {
    min-height: 340px;
  }

  .lp-club-banner-content {
    padding: 16px;
  }

  .lp-club-banner-title {
    margin-top: 15px;
  }

  .lp-club-banner-copy {
    font-size: 11px;
  }

  .lp-club-lootboxes,
  .lp-club-battlepass,
  .lp-club-profile-panel {
    padding: 16px;
  }
}

@media (max-width: 1180px) {
  .lp-club-shell {
    grid-template-columns: 1fr;
  }

  .lp-club-profile-panel {
    min-height: 0;
    display: grid;
    grid-template-columns: 1.1fr 1fr 1fr;
    gap: 16px;
  }

  .lp-club-profile-logo,
  .lp-club-profile-section,
  .lp-club-checkin-card {
    padding: 0;
    border-bottom: 0;
  }

  .lp-club-promo {
    padding-top: 0;
  }

  .lp-club-reward-wallet {
    margin-top: 0;
  }

  .lp-club-reward-wallet-history.is-standalone {
    margin-top: 0;
  }

  .lp-club-quest-widget {
    grid-column: span 2;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

@media (max-width: 1100px) {
  .lp-club-banner-title {
    font-size: var(--banner-title-compact-size, 20px);
    line-height: var(--banner-title-compact-line-height, 1.08);
  }
}

@media (max-width: 920px) {
  .lp-club-topbar-inner {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .lp-club-session-state {
    display: none;
  }

  .lp-club-stage,
  .lp-club-banner-grid,
  .lp-club-loot-grid,
  .lp-club-profile-panel {
    grid-template-columns: 1fr;
  }

  .lp-reward-wallet-inbox-list {
    grid-template-columns: 1fr;
  }

  .lp-club-banner-grid {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 6px;
    scroll-snap-type: x mandatory;
  }

  .lp-club-card {
    min-height: 0;
  }

  .lp-club-quick-metrics {
    margin-top: 22px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .lp-club-banner {
    flex: 0 0 min(78vw, 300px);
    min-height: 360px;
    scroll-snap-align: start;
  }

  .lp-club-battlepass-head {
    display: grid;
  }

  .lp-club-battlepass-help {
    justify-self: start;
  }

  .lp-club-battlepass-top {
    grid-template-columns: 1fr;
  }

  .lp-club-battlepass-season,
  .lp-club-battlepass-main-reward {
    min-height: 0;
  }

  .lp-club-battlepass-main-reward {
    grid-template-columns: minmax(0, 0.88fr) minmax(190px, 1fr);
  }

  .lp-club-battle-track {
    display: grid;
    grid-template-columns: minmax(680px, 1fr) minmax(210px, 260px);
    align-items: stretch;
    overflow-x: auto;
    overflow-y: visible;
    padding-bottom: 8px;
    scroll-snap-type: none;
  }

  .lp-club-pass-map {
    min-width: 680px;
    min-height: 286px;
  }

  .lp-club-season-drop {
    min-width: 210px;
  }
  .lp-club-quest-widget {
    grid-column: auto;
    margin-top: 18px;
    padding-top: 17px;
    border-top: 1px solid rgba(196, 224, 225, 0.12);
  }

  .lp-club-quest-board {
    position: fixed;
    inset: 84px 12px 12px;
    width: auto;
    height: auto;
    min-height: 0;
    max-height: none;
    overflow: hidden;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 28%),
      rgba(5, 12, 15, 0.985);
  }

  .lp-club-detail-head {
    align-items: start;
    flex-direction: column;
  }
}

@media (max-width: 560px) {
  .lp-club-topbar {
    min-height: 70px;
  }

  .lp-club-topbar-inner {
    min-height: 70px;
    padding: 14px;
  }

  .lp-club-network {
    gap: 12px;
  }

  .lp-club-header-actions {
    gap: 6px;
  }

  .lp-reward-wallet-inbox-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .lp-reward-wallet-inbox-count {
    position: absolute;
    top: 18px;
    right: 18px;
  }

  .lp-reward-wallet-inbox-item {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .lp-reward-wallet-inbox-item > .lp-reward-wallet-item-icon {
    width: 36px;
    height: 36px;
  }

  .lp-reward-wallet-inbox-item > button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .lp-reward-wallet-inbox-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .lp-reward-wallet-inbox-actions > span {
    text-align: center;
  }

  .lp-club-brand {
    gap: 9px;
    font-size: 11px;
    letter-spacing: 0.08em;
  }

  .lp-club-brand-mark {
    width: 30px;
    height: 30px;
  }

  .lp-club-switch {
    display: none;
  }

  .lp-club-shell {
    padding: 12px 12px 28px;
  }

  .lp-club-card h1 {
    font-size: 40px;
  }

  .lp-club-card,
  .lp-club-lootboxes,
  .lp-club-battlepass,
  .lp-club-profile-panel {
    padding: 16px;
  }

  .lp-club-banner {
    flex-basis: min(84vw, 280px);
    min-height: 336px;
  }

  .lp-club-battlepass {
    --battlepass-card-width: min(154px, calc(100vw - 76px));
    --battlepass-card-gap: 14px;
  }

  .lp-club-battlepass-season {
    grid-template-columns: minmax(84px, 0.42fr) minmax(0, 1fr);
    padding: 18px;
  }

  .lp-club-battlepass-emblem svg {
    width: 70px;
    height: 70px;
  }

  .lp-club-battlepass-main-reward {
    grid-template-columns: minmax(0, 1fr);
    padding: 20px;
  }

  .lp-club-battlepass-main-case {
    min-height: 128px;
  }

  .lp-club-battlepass-main-case img {
    max-height: 132px;
  }

  .lp-club-battlepass-track-scroll {
    padding-right: 0;
    padding-left: 0;
    scrollbar-width: none;
  }

  .lp-club-battlepass-track-scroll::-webkit-scrollbar {
    display: none;
  }

  .lp-club-battlepass-reward {
    min-height: 222px;
  }

  .lp-club-battlepass-progress {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .lp-club-quick-metrics,
  .lp-club-static-grid {
    grid-template-columns: 1fr;
  }

  .lp-club-section-head {
    align-items: start;
    flex-direction: column;
  }

  .lp-club-quest:not(:last-of-type)::after {
    right: -18px;
  }

  .lp-club-detail-stack {
    padding: 0 12px 36px;
  }

  .lp-club-static-actions {
    flex-direction: column;
  }

  .lp-lootbox-unavailable-actions {
    grid-template-columns: 1fr;
  }

  .lp-battlepass-season-range-header,
  .lp-battlepass-season-range-row,
  .lp-battlepass-season-possible-list > div {
    grid-template-columns: 1fr;
    gap: 7px;
    padding: 12px 0;
  }

  .lp-battlepass-season-range-header > span:last-child {
    grid-column: auto;
  }

  .lp-battlepass-season-range-header > span:not(:first-child),
  .lp-battlepass-season-range-row > b {
    text-align: left;
  }

  .lp-battlepass-season-guaranteed-mark {
    justify-self: start;
  }

  .lp-battlepass-season-range-row i {
    display: none;
  }
}
`;
