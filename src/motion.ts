import { useEffect, useState, type CSSProperties } from "react";

const MOTION_KEY = "claude-ssh-workbench.motion";

function initialMotion() {
  try {
    const saved = localStorage.getItem(MOTION_KEY);
    if (saved) return saved === "on";
  } catch { /* Optional storage. */ }
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ambient animation switch, persisted per browser and mirrored to <html data-motion>. */
export function useMotion() {
  const [motion, setMotion] = useState(initialMotion);
  useEffect(() => {
    document.documentElement.dataset.motion = motion ? "on" : "off";
    try { localStorage.setItem(MOTION_KEY, motion ? "on" : "off"); } catch { /* Optional storage. */ }
  }, [motion]);
  return [motion, setMotion] as const;
}

/** Inline CSS custom properties, e.g. a stagger index for entrance animations. */
export const cssVars = (vars: Record<`--${string}`, string | number>) => vars as CSSProperties;

/** Decorative cues between components: a lightspeed jump, or a keystroke reaching the terminal. */
type Signal = "hyperspace" | "keystroke";
export const emit = (signal: Signal) => window.dispatchEvent(new Event(`workbench:${signal}`));
export const listen = (signal: Signal, listener: () => void) => {
  window.addEventListener(`workbench:${signal}`, listener);
  return () => window.removeEventListener(`workbench:${signal}`, listener);
};
