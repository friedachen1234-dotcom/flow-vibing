/** Inline SVG icons (Lucide outlines), 24-unit viewBox, sized by the `size` prop. */
const PATHS: Record<string, string> = {
  "arrow-left": "M19 12H5M12 19l-7-7 7-7",
  smartphone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01",
  "git-branch": "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  "mouse-pointer": "M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3zM13 13l6 6",
  crosshair: "M22 12h-4M6 12H2M12 6V2M12 22v-4M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0",
  play: "M5 3l14 9-14 9V3z",
  sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM5 19l.7 1.8L7.5 21.5l-1.8.7L5 24l-.7-1.8-1.8-.7 1.8-.7L5 19zM19 2l.5 1.3 1.3.5-1.3.5L19 5.6l-.5-1.3-1.3-.5 1.3-.5L19 2z",
  "sticky-note": "M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2h-3M15 21v-5a2 2 0 0 1 2-2h5",
  image: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM21 15l-5-5L5 21",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  "message-square": "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2",
  maximize: "M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3",
  "layout-grid": "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  "zoom-in": "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35M11 8v6M8 11h6",
  "zoom-out": "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35M8 11h6",
  map: "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16",
  x: "M18 6L6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
  "chevron-right": "M9 18l6-6-6-6",
  "chevron-down": "M6 9l6 6 6-6",
  "panel-right": "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM15 3v18",
  square: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
  "more-horizontal": "M12 12h.01M19 12h.01M5 12h.01",
  check: "M20 6L9 17l-5-5",
  pin: "M12 17v5M9 10.8V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6.8l2 2.2H7l2-2.2z",
  "rotate-ccw": "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  wand: "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h.01M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5",
  "corner-up-left": "M9 14L4 9l5-5M20 20v-7a4 4 0 0 0-4-4H4",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  stop: "M6 6h12v12H6z",
  refresh: "M23 4v6h-6M1 20v-6h6M20.5 9A9 9 0 0 0 5.6 5.6L1 10M23 14l-4.6 4.4A9 9 0 0 1 3.5 15"
};

export function Icon({ name, size = 16, strokeWidth = 1.8, className }: { name: keyof typeof PATHS | string; size?: number; strokeWidth?: number; className?: string }) {
  const d = PATHS[name] ?? PATHS.square;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
