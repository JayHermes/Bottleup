import React from "react";
import "./brand.css";

export function BrandMark({ size = 38 }) {
  return <img src="/brand/mark.svg" width={size * 0.91} height={size} alt="" aria-hidden="true" />;
}

export function BrandLogo({ full = false, light = false }) {
  return <img className={`brandAsset${full ? ' brandAssetFull' : ''}`} src={`/brand/${full ? 'full' : 'wordmark'}${light ? '-light' : ''}.svg`} alt="BottleUp — Recycle. Reward. Repeat" />;
}

export default function Brand({ footer = false }) {
  return <a className={`bu-brand${footer ? ' bu-brand-footer' : ''}`} href="#top" aria-label="BottleUp home"><BrandLogo full={footer} /></a>;
}
