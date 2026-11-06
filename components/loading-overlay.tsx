"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

type LoadingOverlayProps = {
  label?: string;
};

type LoadingVariant = "orbit" | "equalizer" | "shuffle" | "meteor";

type FloatingShape = {
  id: number;
  left: string;
  top: string;
  width: string;
  height: string;
  delay: string;
  duration: string;
};

const LOADING_VARIANTS: LoadingVariant[] = ["orbit", "equalizer", "shuffle", "meteor"];

const FUN_SUBLINES = [
  "Warming up the laugh lab",
  "Shuffling captions behind the curtain",
  "Counting punchlines at unsafe speed",
  "Rehearsing the tiny applause machine",
  "Spinning up the silliness engine",
];

const FUN_BADGES = ["chaos mode", "punchline shuffle", "giggle engine", "caption vortex"];

const getRandomItem = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)] ?? items[0];

const createFloatingShapes = (): FloatingShape[] =>
  Array.from({ length: 9 }, (_, index) => ({
    id: index,
    left: `${8 + Math.random() * 84}%`,
    top: `${10 + Math.random() * 78}%`,
    width: `${14 + Math.random() * 34}px`,
    height: `${14 + Math.random() * 34}px`,
    delay: `${Math.random() * 1.6}s`,
    duration: `${3.5 + Math.random() * 3.5}s`,
  }));

const renderLoader = (variant: LoadingVariant) => {
  switch (variant) {
    case "orbit":
      return (
        <div className="app-loading-orbit" aria-hidden="true">
          <span className="app-loading-orbit-core" />
          <span className="app-loading-orbit-ring app-loading-orbit-ring-a">
            <span className="app-loading-orbit-dot" />
          </span>
          <span className="app-loading-orbit-ring app-loading-orbit-ring-b">
            <span className="app-loading-orbit-dot" />
          </span>
          <span className="app-loading-orbit-ring app-loading-orbit-ring-c">
            <span className="app-loading-orbit-dot" />
          </span>
        </div>
      );
    case "equalizer":
      return (
        <div className="app-loading-equalizer" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              className="app-loading-equalizer-bar"
              style={{ animationDelay: `${index * 0.09}s` }}
            />
          ))}
        </div>
      );
    case "shuffle":
      return (
        <div className="app-loading-shuffle" aria-hidden="true">
          <span className="app-loading-card app-loading-card-a" />
          <span className="app-loading-card app-loading-card-b" />
          <span className="app-loading-card app-loading-card-c" />
        </div>
      );
    case "meteor":
      return (
        <div className="app-loading-meteor" aria-hidden="true">
          <span className="app-loading-meteor-line" />
          <span className="app-loading-meteor-star app-loading-meteor-star-a" />
          <span className="app-loading-meteor-star app-loading-meteor-star-b" />
          <span className="app-loading-meteor-star app-loading-meteor-star-c" />
        </div>
      );
  }
};

export function LoadingOverlay({ label = "Loading..." }: LoadingOverlayProps) {
  const [variant] = useState<LoadingVariant>(() => getRandomItem(LOADING_VARIANTS));
  const [subline] = useState(() => getRandomItem(FUN_SUBLINES));
  const [badge] = useState(() => getRandomItem(FUN_BADGES));
  const [floatingShapes] = useState(() => createFloatingShapes());

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="app-loading-overlay" role="status" aria-live="polite" aria-label={label}>
      <div className="app-loading-backdrop" aria-hidden="true">
        {floatingShapes.map((shape) => (
          <span
            key={shape.id}
            className="app-loading-float"
            style={{
              left: shape.left,
              top: shape.top,
              width: shape.width,
              height: shape.height,
              animationDelay: shape.delay,
              animationDuration: shape.duration,
            }}
          />
        ))}
      </div>
      <div className="app-loading-center">
        <div className={`app-loading-panel app-loading-panel--${variant}`}>
          <p className="app-loading-badge">{badge}</p>
          <div className="app-loading-stage">{renderLoader(variant)}</div>
          <div className="space-y-1 text-center">
            <p className="text-base font-semibold">{label}</p>
            <p className="app-muted text-xs">{subline}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
