// Styles of the game tutorial. Rendered inside `.lp-club-home`, so it uses the
// game palette variables declared there (see club-home-css.ts).
export const gameTutorialCss = String.raw`
.lp-tutorial {
  position: fixed;
  inset: 0;
  z-index: 95;
  pointer-events: none;
}

.lp-tutorial-backdrop {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  background: transparent;
}

.lp-tutorial-backdrop.is-dimmed {
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(6px);
}

.lp-tutorial-spotlight {
  position: fixed;
  border: 2px solid var(--cyan);
  border-radius: 12px;
  box-shadow:
    0 0 0 200vmax rgba(0, 0, 0, 0.72),
    0 0 28px rgba(131, 228, 236, 0.32);
  pointer-events: none;
}

.lp-tutorial-card {
  position: fixed;
  display: grid;
  gap: 12px;
  width: min(380px, calc(100vw - 24px));
  padding: 20px;
  border: 1px solid rgba(131, 228, 236, 0.34);
  border-radius: var(--radius);
  color: var(--text);
  background:
    linear-gradient(135deg, rgba(131, 228, 236, 0.1), transparent 46%),
    rgba(5, 12, 14, 0.98);
  box-shadow:
    0 30px 90px rgba(0, 0, 0, 0.62),
    inset 0 0 0 1px rgba(131, 228, 236, 0.06);
  pointer-events: auto;
  animation: lp-tutorial-in 160ms ease-out;
}

.lp-tutorial[data-mode="center"] .lp-tutorial-card {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-name: lp-tutorial-in-center;
}

.lp-tutorial[data-mode="sheet"] .lp-tutorial-card {
  left: 12px;
  right: 12px;
  bottom: max(12px, env(safe-area-inset-bottom));
  width: auto;
}

/* On wide screens a block taller than the window (Battle Pass) leaves no room
   next to it: keep the card at its normal width in the bottom-right corner
   instead of a full-width strip. */
@media (min-width: 641px) {
  .lp-tutorial[data-mode="sheet"] .lp-tutorial-card {
    left: auto;
    right: 24px;
    bottom: 24px;
    width: min(380px, calc(100vw - 48px));
  }
}

.lp-tutorial-card h3 {
  max-width: calc(100% - 48px);
  margin: 0;
  color: var(--text);
  font-size: 22px;
  font-weight: 860;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.lp-tutorial-card p {
  margin: 0;
  color: #c9d6d7;
  font-size: 16px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.lp-tutorial-counter {
  width: fit-content;
  border: 1px solid rgba(131, 228, 236, 0.34);
  border-radius: 999px;
  padding: 5px 9px;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: rgba(131, 228, 236, 0.08);
}

.lp-tutorial-close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid rgba(196, 224, 225, 0.14);
  border-radius: 7px;
  color: var(--muted);
  background: rgba(196, 224, 225, 0.04);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.lp-tutorial-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.lp-tutorial-primary,
.lp-tutorial-secondary {
  min-height: 44px;
  border-radius: 7px;
  font: inherit;
  font-size: 15px;
  font-weight: 860;
  cursor: pointer;
}

.lp-tutorial-primary {
  border: 1px solid rgba(131, 228, 236, 0.6);
  color: #041013;
  background: linear-gradient(135deg, var(--cyan), #c8f6f9);
}

.lp-tutorial-secondary {
  border: 1px solid rgba(196, 224, 225, 0.22);
  color: var(--text);
  background: rgba(196, 224, 225, 0.05);
}

.lp-tutorial-skip {
  justify-self: center;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  color: var(--muted);
  background: transparent;
  font: inherit;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.lp-tutorial-close:focus-visible,
.lp-tutorial-primary:focus-visible,
.lp-tutorial-secondary:focus-visible,
.lp-tutorial-skip:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}

.lp-tutorial-close:hover,
.lp-tutorial-secondary:hover,
.lp-tutorial-skip:hover {
  color: var(--text);
}

@keyframes lp-tutorial-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes lp-tutorial-in-center {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 6px));
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lp-tutorial-card {
    animation: none;
  }
}
`;
