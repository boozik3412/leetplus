"use client";

import Image from "next/image";
import { LeetPlusMark } from "@/components/brand/leetplus-logo";

export function WalletCaseIcon() {
  return (
    <Image
      src="/assets/gamification-lootbox.svg"
      alt=""
      width={24}
      height={24}
      aria-hidden="true"
    />
  );
}

export function BrandMark({ logoUrl }: { logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <span className="lp-club-brand-mark is-custom-logo" aria-hidden="true">
        <img src={logoUrl} alt="" />
      </span>
    );
  }

  return (
    <span className="lp-club-brand-mark" aria-hidden="true">
      <LeetPlusMark tone="onDark" />
    </span>
  );
}

export function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function ClubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M4 9h16" />
      <path d="M6 9v10h12V9" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 0 0-14.4-4.8L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.4 4.8L20 16" />
      <path d="M20 20v-4h-4" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M7 10V8a5 5 0 0 1 10 0v2" />
      <path d="M6 10h12v10H6z" />
      <path d="M12 14v2" />
    </svg>
  );
}

export function ProfileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M12 3 4.5 7.4v8.8L12 21l7.5-4.8V7.4L12 3Z" />
      <path d="M9 12.2 11.2 14 15.4 9.6" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

export function ExitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M10 6H6v12h4" />
      <path d="M13 8l4 4-4 4" />
      <path d="M8 12h9" />
    </svg>
  );
}

export function GamepadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
      <path d="M17.3 5H6.7a4 4 0 0 0-3.96 3.43l-.7 5A3 3 0 0 0 5 17c.8 0 1.56-.32 2.12-.88L9 14.25h6l1.88 1.87A3 3 0 0 0 21.96 13.43l-.7-5A4 4 0 0 0 17.3 5z" />
    </svg>
  );
}
