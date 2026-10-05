import React, { useState, useRef, useEffect } from "react";

const C = {
  bg: "#ffffff",        // paper white canvas
  mist: "#f2f2f3",      // neutral card / example box surface
  fog: "#fafafb",       // subtle alt band
  ink: "#17191c",       // primary text, filled pill background
  muted: "#777b86",     // helper text, descriptions
  ash: "#979799",       // ghost typographic tags
  smoke: "#a3a6af",     // placeholders, captions
  line: "#ececec",      // hairline borders
  peach: "#e9e5f1",     // the one accent surface
  sienna: "#4f4566",    // ink on peach
};
const serif = "Georgia, 'Times New Roman', ui-serif, serif";
const sans = "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif";
const mono = "ui-monospace, Menlo, Monaco, 'Courier New', monospace";

// The only shadow allowed in the system — floating white artifact cards.
const CARD_SHADOW = "0 0 0 1px rgba(4,23,43,0.05), 0 8px 10px -6px rgba(0,0,0,0.1)";

// Screenshots of the running tool, clipped to their content. Injected by artifacts/inline-shots.mjs.
const SHOTS = {
  "1-prototype": "/artifacts/flow-vibing/1-prototype.jpg",
  "2-flow": "/artifacts/flow-vibing/2-flow.jpg",
  "3-inspect": "/artifacts/flow-vibing/3-inspect.jpg",
  "4-vault": "/artifacts/flow-vibing/4-vault.jpg",
  "5-variants": "/artifacts/flow-vibing/5-variants.jpg",
};

const DECK_URL = "https://www.figma.com/deck/ZsJHGx1TGQiDwixjX0AAfK/Redesign-lovart?node-id=2-1555&p=f&viewport=738%2C672%2C0.27&t=Hbx6FBXn5iVOwd86-1&scaling=min-zoom&content-scaling=fixed&page-id=0%3A1";

const STEPS = [
  {
    pill: "Why",
    title: "Designers work on a board, not in a thread",
    custom: "thesis",
    body:
      "This idea came out of a redesign challenge I worked on previously, where I identified a fundamental gap in AI image-generation tools: they don't reflect how designers naturally work. References, explorations and iterations should coexist on a shared board, giving both designers and stakeholders a common visual context, and letting the agent generate directly from that context.",
    body2:
      "The same gap exists in vibe coding. Most current tools rely on chat-based iteration, but UX designers are more accustomed to working spatially: comparing treatments side by side, arranging screens into flows, and placing references freely alongside the work. In tools like Claude Code and Codex, that layer of visual context is still largely missing.",
  },
  {
    pill: "Prototype",
    title: "The prototype runs on the canvas",
    body:
      "Every screen node is the standalone HTML document itself, live. Not a flat export of one. Tapping a control inside a node navigates to the next screen, because the runtime reads the moves from the spec rather than from links in the markup. Scroll pans the board; select a screen to scroll inside it.",
    shot: "1-prototype",
    look: ["Real documents, running, with a Live badge and a state menu", "References sit beside the screen they inform", "Edge cases flagged on each header"],
    quote:
      "Elements that navigate carry data-flow-el=\"<element-id>\" and data-flow-transition=\"<transition-id>\". Never <a href> between screens.",
    source: "README.md · Screen HTML contract",
  },
  {
    pill: "Flow view",
    title: "See the flow first, then flip to the pixels",
    body:
      "One toggle in the header swaps how the same nodes draw. Nothing is exported or regenerated in between. Each card lists its interactions as rows, and each row is where its line starts. The main path is drawn heavier, other moves fade back, and edge cases hang under their screen on a dashed rail.",
    shot: "2-flow",
    look: ["Prototype / Flow toggle, top centre", "One row per interaction, main flow weighted", "Edge cases stacked under the screen they belong to"],
    quote:
      "Claude writes a Design Spec (flow.json) alongside the screens. The flow view renders the spec. The prototype view runs the screens through a runtime shell that reads transitions from the spec.",
    source: "README.md · The idea in one paragraph",
  },
  {
    pill: "Edit in place",
    title: "Edit a move without losing the flow around it",
    body:
      "Click an interaction row and its line lights while every other fades. Its spec opens beside the board: trigger, condition, animation, and the edge cases that hang off it, each editable where it sits. The flow stays on screen, so a change is made in view of everything it touches.",
    shot: "3-inspect",
    look: ["Tap sleep selected: one line lit, the rest faded", "Trigger, condition and animation editable in place", "One click makes it the main move"],
    quote:
      "Editing the flow produces structured change requests; applying them regenerates only the affected screens, with the rest passed to Claude as keep-as-is.",
    source: "README.md · The idea in one paragraph",
  },
  {
    pill: "Vault",
    title: "References hang directly over the screens",
    body:
      "A moodboard capture, a component detail, a type specimen, a colour, a written craft rule. They sit on the same board as the running prototype, and the dashed line from one to a screen carries a named relation, so the instruction lives next to the thing it changes rather than inside a prompt nobody can find again.",
    shot: "4-vault",
    look: ["Style references beside the running screen", "The line lands on a named element, not just a screen", "The relation is the instruction"],
    quote:
      "Match style — palette, type, spacing, and mood of the reference. Use layout — structural arrangement only, not styling. Avoid — negative reference. Do not do this.",
    source: "packages/shared/src/canvas.ts · MAGIC_RELATION_LABELS",
  },
  {
    pill: "Variants",
    title: "Pick an element, get alternatives of it",
    body:
      "Click any element inside the running prototype and it becomes the subject of the composer at the bottom of the board. The references already wired to it come along with the request, so the alternatives arrive with the reasoning attached. Hovering an option previews it in the live screen, and applying one splices in that element alone, keeping the original so you can go back.",
    shot: "5-variants",
    look: ["Recovery ring picked, with handles, in the live screen", "The composer targets it and asks for three", "Hover previews in place; Apply keeps the original"],
    quote:
      "The one place to talk to Claude from the board. It always knows what it is about: the picked element, the selected screen, or the whole project.",
    source: "packages/web/src/components/Composer.tsx",
  },
];

function ArtifactMark({ size = 46 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: "#f1eef7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 46 46">
        <rect x="5" y="8" width="14" height="18" rx="3" fill="none" stroke={C.ink} strokeWidth="1.7" />
        <rect x="27" y="8" width="14" height="18" rx="3" fill="#cbbfe4" stroke={C.sienna} strokeWidth="1" />
        <line x1="19" y1="17" x2="27" y2="17" stroke={C.ink} strokeWidth="1.5" />
        <circle cx="12" cy="36" r="4.5" fill={C.ink} />
        <circle cx="34" cy="36" r="4.5" fill="none" stroke={C.ink} strokeWidth="1.6" />
        <line x1="16.5" y1="36" x2="29.5" y2="36" stroke={C.ink} strokeWidth="1.5" strokeDasharray="2.5 2.5" />
      </svg>
    </div>
  );
}

/** The opening argument, drawn: one thread against one board. */
function Thesis({ step }) {
  const bar = (w, right) => (
    <span style={{ display: "block", height: 9, width: w, borderRadius: 4, background: "#dedfe3", marginLeft: right ? "auto" : 0 }} />
  );
  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.6, color: C.ink, maxWidth: "64ch" }}>{step.body}</p>
      <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6, color: C.muted, maxWidth: "64ch" }}>{step.body2}</p>

      <a
        href={DECK_URL}
        target="_blank"
        rel="noreferrer"
        className="fvCta"
        style={{
          display: "flex", alignItems: "center", gap: 14, margin: "4px 0 20px", textDecoration: "none",
          background: C.ink, color: "#fff", borderRadius: 14, padding: "15px 16px",
          boxShadow: "0 10px 22px -12px rgba(23,25,28,0.7)",
        }}
      >
        <span style={{ width: 38, height: 38, borderRadius: 10, background: C.peach, color: C.sienna, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>F</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>See the redesign challenge</span>
          <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>Figma deck · where this idea started</span>
        </span>
        <span className="fvArrow" style={{ width: 30, height: 30, borderRadius: 9999, background: "rgba(255,255,255,0.12)", display: "grid", placeItems: "center", fontSize: 14, flexShrink: 0, transition: "transform 140ms, background 140ms" }}>↗</span>
      </a>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 12, alignItems: "stretch" }}>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 14px", background: C.fog }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1, color: C.smoke, textTransform: "uppercase", marginBottom: 12 }}>A thread</div>
          <div style={{ display: "grid", gap: 7 }}>
            {[70, 46, 84, 38, 62].map((w, i) => bar(`${w}%`, i % 2 === 1))}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 13, lineHeight: 1.45 }}>One thing at a time. What came before scrolls away.</div>
        </div>

        <div style={{ border: `1px solid ${C.peach}`, borderRadius: 12, padding: "13px 14px", background: "#fbfaff" }}>
          <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1, color: C.sienna, textTransform: "uppercase", marginBottom: 12 }}>A board</div>
          <svg viewBox="0 0 300 122" style={{ width: "100%", height: 122, display: "block" }} role="img" aria-label="References, screens and variants side by side on one board">
            <g stroke={C.sienna} strokeWidth="1" strokeDasharray="3 3" fill="none" opacity="0.7">
              <path d="M30 44 L20 66" /><path d="M92 44 L56 66" /><path d="M74 98 L150 94" />
            </g>
            <text x="6" y="12" style={{ fontFamily: sans, fontSize: 8.5, fill: C.sienna }}>references</text>
            <rect x="6" y="18" width="56" height="24" rx="4" fill="#e4dff0" stroke={C.sienna} strokeWidth="0.8" />
            <rect x="70" y="18" width="44" height="24" rx="4" fill="#e4dff0" stroke={C.sienna} strokeWidth="0.8" />
            <text x="80" y="76" style={{ fontFamily: sans, fontSize: 8.5, fill: C.smoke }}>screens</text>
            <rect x="6" y="66" width="30" height="50" rx="4" fill="#fff" stroke={C.ink} strokeWidth="1.2" />
            <rect x="42" y="66" width="30" height="50" rx="4" fill="#fff" stroke={C.line} strokeWidth="1" />
            <text x="150" y="60" style={{ fontFamily: sans, fontSize: 8.5, fill: C.smoke }}>variants of one element</text>
            <rect x="150" y="66" width="42" height="44" rx="4" fill="#fff" stroke={C.line} strokeWidth="1" />
            <rect x="198" y="66" width="42" height="44" rx="4" fill="#fff" stroke={C.line} strokeWidth="1" />
            <rect x="246" y="66" width="42" height="44" rx="4" fill="#fff" stroke={C.line} strokeWidth="1" />
          </svg>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>Everything at once, and the agent generates from the same context you can see.</div>
        </div>
      </div>

    </div>
  );
}

function Shot({ step, onOpen }) {
  const src = SHOTS[step.shot];
  return (
    <figure style={{ margin: 0 }}>
      <button
        onClick={() => src && onOpen(step.shot)}
        className="fvShot"
        aria-label={`Enlarge screenshot: ${step.title}`}
        style={{
          display: "block", width: "100%", padding: 0, border: `1px solid ${C.line}`, borderRadius: 12,
          overflow: "hidden", background: C.fog, cursor: src ? "zoom-in" : "default", position: "relative",
        }}
      >
        {src ? (
          <img src={src} alt={step.title} style={{ display: "block", width: "100%", height: "auto" }} />
        ) : (
          <div style={{ padding: "48px 16px", color: C.smoke, fontSize: 12, fontFamily: mono }}>screenshot: {step.shot}</div>
        )}
        <span
          className="fvZoom"
          style={{
            position: "absolute", right: 10, bottom: 10, background: "rgba(23,25,28,0.82)", color: "#fff",
            borderRadius: 9999, padding: "4px 10px", fontSize: 10.5, fontWeight: 500, letterSpacing: 0.2,
            opacity: 0, transition: "opacity 140ms",
          }}
        >
          Click to enlarge
        </span>
      </button>
      <figcaption style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 9 }}>
        {step.look.map((l) => (
          <span key={l} style={{ fontSize: 11.5, color: C.muted, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 4, height: 4, borderRadius: 2, background: C.sienna, flexShrink: 0 }} />
            {l}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Quote({ step }) {
  return (
    <blockquote style={{ margin: "16px 0 0", display: "flex", gap: 12 }}>
      <span style={{ width: 3, background: C.peach, borderRadius: 2, flexShrink: 0 }} />
      <span>
        <span style={{ fontFamily: serif, fontSize: 14.5, lineHeight: 1.5, color: C.ink, display: "block" }}>{step.quote}</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: C.smoke, marginTop: 6, display: "block", letterSpacing: 0.2 }}>{step.source}</span>
      </span>
    </blockquote>
  );
}

function Main() {
  const [step, setStep] = useState(0);
  const [wide, setWide] = useState(true);
  const [zoomed, setZoomed] = useState(null);
  const rootRef = useRef(null);
  const active = STEPS[step];

  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !rootRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWide(entry.contentRect.width >= 560);
    });
    ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e) => { if (e.key === "Escape") setZoomed(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const caret = (dir) => {
    const next = step + dir;
    const disabled = next < 0 || next >= STEPS.length;
    return (
      <button
        onClick={() => !disabled && setStep(next)}
        disabled={disabled}
        aria-label={dir < 0 ? "Previous step" : "Next step"}
        style={{
          width: 26, height: 26, borderRadius: 9999, border: `1px solid ${C.line}`, background: C.bg,
          color: disabled ? "#d3d5da" : C.muted, cursor: disabled ? "default" : "pointer",
          fontSize: 14, lineHeight: 1, display: "grid", placeItems: "center", fontFamily: "inherit",
        }}
      >
        {dir < 0 ? "‹" : "›"}
      </button>
    );
  };

  const pills = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
      {STEPS.map((sd, i) => {
        const on = i === step;
        return (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={on ? undefined : "fvChip"}
            style={{
              border: "none", background: on ? C.ink : "transparent", color: on ? "#fff" : C.muted,
              borderRadius: 9999, padding: "5px 12px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {i + 1} {sd.pill}
          </button>
        );
      })}
    </div>
  );

  const stepList = (
    <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 2 }}>
      {STEPS.map((sd, i) => {
        const on = i === step;
        return (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={on ? undefined : "fvChip"}
            style={{
              display: "flex", alignItems: "center", gap: 12, border: "none", background: "transparent",
              borderLeft: `2px solid ${on ? C.ink : "transparent"}`, padding: "5px 0 5px 11px",
              fontSize: 13.5, fontWeight: on ? 500 : 400, color: on ? C.ink : C.muted,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}
          >
            <span style={{ flex: 1 }}>{sd.pill}</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: on ? C.ink : C.smoke, letterSpacing: 0.5 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
          </button>
        );
      })}
    </div>
  );

  const stepContent = (
    <div key={"step-" + step}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 3 }}>Step {step + 1} of {STEPS.length}</div>
        <div style={{ fontFamily: serif, fontSize: 21, lineHeight: 1.25, letterSpacing: "-0.01em", color: C.ink }}>
          {active.title}
        </div>
        {!active.custom && <div style={{ fontSize: 13, lineHeight: 1.55, color: C.muted, marginTop: 7, maxWidth: "64ch" }}>{active.body}</div>}
      </div>
      {active.custom ? <Thesis step={active} /> : (<><Shot step={active} onOpen={setZoomed} /><Quote step={active} /></>)}
    </div>
  );

  const overlay = zoomed ? (
    <div
      onClick={() => setZoomed(null)}
      role="dialog"
      aria-label="Enlarged screenshot"
      style={{
        position: "fixed", inset: 0, zIndex: 9999, background: "rgba(18,19,22,0.86)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out",
      }}
    >
      <img src={SHOTS[zoomed]} alt="" style={{ maxWidth: "min(1120px, 96vw)", maxHeight: "92vh", width: "auto", borderRadius: 10, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }} />
      <span style={{ position: "fixed", top: 18, right: 22, color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: sans }}>Esc to close</span>
    </div>
  ) : null;

  return (
    <div ref={rootRef} style={{ fontFamily: sans, color: C.ink, maxWidth: 1120, boxSizing: "border-box" }}>
      <style>{`
        .fvChip:hover { color: #17191c !important; }
        .fvShot:hover .fvZoom { opacity: 1; }
        .fvShot:focus-visible, .fvCta:focus-visible { outline: 2px solid ${C.sienna}; outline-offset: 3px; }
        .fvCta:hover { background: #24272d !important; }
        .fvCta:hover .fvArrow { transform: translate(2px, -2px); background: rgba(255,255,255,0.2); }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>
      {wide ? (
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
          <div style={{ width: 258, flexShrink: 0 }}>
            <ArtifactMark size={48} />
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1, color: C.smoke, margin: "16px 0 7px" }}>
              ONE CANVAS · SIX STEPS
            </div>
            <div style={{ fontFamily: serif, fontSize: 32, fontWeight: 400, lineHeight: 1.18, letterSpacing: "-0.012em" }}>
              Flow Vibing
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.muted, marginTop: 10 }}>
              Every prototype is also a flow.
            </div>
            {stepList}
          </div>
          <div style={{ flex: 1, minWidth: 0, maxWidth: 800, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 20, padding: "20px 24px 24px", boxSizing: "border-box", position: "relative", boxShadow: CARD_SHADOW }}>
            <div style={{ position: "absolute", top: 18, right: 20, display: "flex", gap: 6 }}>
              {caret(-1)}
              {caret(1)}
            </div>
            {stepContent}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <ArtifactMark size={40} />
            <div>
              <div style={{ fontFamily: serif, fontSize: 21, fontWeight: 400, lineHeight: 1.25, letterSpacing: "-0.01em" }}>Flow Vibing</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Every prototype is also a flow.</div>
            </div>
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 }}>
            {pills}
            {stepContent}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, gap: 6 }}>
            {caret(-1)}
            {caret(1)}
          </div>
        </div>
      )}
      {overlay}
    </div>
  );
}

render(<Main />);
