import React from "react";

export function BrandMark({ size = 38 }) {
  return (
    <svg
      width={size * 0.7}
      height={size}
      viewBox="0 0 28 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 0h8v6l6 8c1.3 1.8 2 3.8 2 6v15a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V20c0-2.2.7-4.2 2-6l6-8V0Z"
        fill="currentColor"
      />
      <path
        d="M14 30V17m-5 5 5-5 5 5"
        stroke="var(--brand-mark-cutout, #f7f4ec)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Brand({ footer = false }) {
  return (
    <a
      className={`bu-brand${footer ? " bu-brand-footer" : ""}`}
      href="#top"
      aria-label="BottleUp home"
    >
      <BrandMark />
      <span>
        bottleup<span className="bu-brand-dot">.</span>
      </span>
    </a>
  );
}
