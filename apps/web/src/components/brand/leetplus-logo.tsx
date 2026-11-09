import type { CSSProperties } from "react";

/**
 * LeetPlus brand mark («плюс из модулей», вариант A) and the full logo with
 * the outlined «LeetPlus» wordmark. Source files: public/assets/brand.
 *
 * Colors come from the brand tokens in globals.css:
 * - `tone="auto"` follows the app theme (`.dark`), for corporate screens;
 * - `tone="onDark"` / `tone="onLight"` pin the variant for surfaces that are
 *   always dark (guest game) or always light.
 */

export type LeetPlusLogoTone = "auto" | "onDark" | "onLight";

// One quarter of the mark; the second is the same path rotated 180°.
const MARK_PATH =
  "M6 32 30 8H52V22H38V40H22V54H6Z M58 8H82L90 16V40H58Z";

// Wordmark glyphs (letters converted to curves in the brand kit).
const WORDMARK_GLYPHS: ReadonlyArray<readonly [number, string]> = [
  [-68, "M68 0H431V131H205V739H68Z"],
  [
    355,
    "M603 218C607 238 608 250 608 270C608 441 487 567 322 567C159 567 30 438 30 275C30 113 161 -13 330 -13C421 -13 492 20 550 87C571 113 585 136 594 164H449C415 124 382 109 327 109C248 109 190 151 174 218ZM170 335C191 407 245 445 324 445C406 445 460 406 477 335Z",
  ],
  [
    978,
    "M603 218C607 238 608 250 608 270C608 441 487 567 322 567C159 567 30 438 30 275C30 113 161 -13 330 -13C421 -13 492 20 550 87C571 113 585 136 594 164H449C415 124 382 109 327 109C248 109 190 151 174 218ZM170 335C191 407 245 445 324 445C406 445 460 406 477 335Z",
  ],
  [1601, "M74 0H207V433H287V554H207V739H74V554H9V433H74Z"],
  [
    1884,
    "M68 0H205V281H249C354 281 402 289 443 314C503 352 540 426 540 511C540 596 504 666 440 705C398 730 348 739 251 739H68ZM205 412V608H251C296 608 317 606 338 601C378 590 402 555 402 509C402 473 386 445 357 429C336 418 299 412 245 412Z",
  ],
  [2427, "M54 0H187V739H54Z"],
  [
    2650,
    "M547 554H414V293C414 219 409 184 393 160C374 127 337 109 292 109C258 109 232 120 214 144C195 168 187 208 187 283V554H54V257C54 163 65 114 96 69C133 16 192 -13 265 -13C332 -13 373 4 424 53V0H547Z",
  ],
  [
    3233,
    "M19 176C25 122 34 93 56 64C92 16 155 -13 222 -13C333 -13 420 70 420 176C420 260 378 304 266 338C211 355 211 355 198 361C182 369 172 382 172 399C172 425 194 445 223 445C251 445 269 430 275 401H405C403 448 392 476 365 506C330 545 278 567 223 567C119 567 39 493 39 398C39 317 82 271 193 234C243 217 248 215 262 206C278 196 287 181 287 163C287 132 262 109 227 109C188 109 166 129 153 176Z",
  ],
];

const LOGO_VIEWBOX_WIDTH = 405.97;

function toneColors(tone: LeetPlusLogoTone) {
  if (tone === "onDark") {
    return {
      accent: "var(--brand-accent-on-dark)",
      ink: "var(--brand-ink-on-dark)",
    };
  }

  if (tone === "onLight") {
    return {
      accent: "var(--brand-accent-on-light)",
      ink: "var(--brand-ink-on-light)",
    };
  }

  return { accent: "var(--brand-accent)", ink: "var(--brand-ink)" };
}

function MarkShapes({ fill }: { fill: string }) {
  return (
    <g fill={fill}>
      <path d={MARK_PATH} />
      <path d={MARK_PATH} transform="rotate(180 48 48)" />
    </g>
  );
}

/** The square mark alone. Decorative unless `title` is given. */
export function LeetPlusMark({
  size = 32,
  tone = "auto",
  title,
  className,
  style,
}: {
  size?: number;
  tone?: LeetPlusLogoTone;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { accent } = toneColors(tone);

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, ...style }}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <MarkShapes fill={accent} />
    </svg>
  );
}

/** Mark + «LeetPlus» wordmark. `height` sets the size, width follows. */
export function LeetPlusLogo({
  height = 32,
  tone = "auto",
  title = "LeetPlus",
  decorative = false,
  className,
  style,
}: {
  height?: number;
  tone?: LeetPlusLogoTone;
  title?: string;
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { accent, ink } = toneColors(tone);

  return (
    <svg
      viewBox={`0 0 ${LOGO_VIEWBOX_WIDTH} 96`}
      height={height}
      width={Math.round((height * LOGO_VIEWBOX_WIDTH) / 96)}
      className={className}
      style={{ flexShrink: 0, ...style }}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
    >
      <MarkShapes fill={accent} />
      <g fill={ink} transform="translate(126 73.5) scale(0.075 -0.075)">
        {WORDMARK_GLYPHS.map(([offset, d]) => (
          <path key={offset} d={d} transform={`translate(${offset} 0)`} />
        ))}
      </g>
    </svg>
  );
}
