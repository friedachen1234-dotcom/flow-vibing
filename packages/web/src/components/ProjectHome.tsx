import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceKind } from "@flow/shared";
import { api, type ExampleMeta } from "../api";
import { useFlow } from "../store";
import { Icon } from "./Icon";
import { IS_STATIC, LOCAL_APP_URL } from "../static";

const DEVICE_LABEL: Record<DeviceKind, string> = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" };
/** What each example is, for the card; the product name inside stays its own. */
const EXAMPLE_TITLE: Record<string, string> = { baseline: "Training program", "lumen-bank": "Everyday banking", plated: "Recipe collection", "relay-desk": "Support inbox" };
/** Each example's stage takes a tint from its own design, so the gallery has colour without decoration. */
const EXAMPLE_TINT: Record<string, string> = { baseline: "#16181D", "lumen-bank": "#E6ECFF", plated: "#F5EADF", "relay-desk": "#E3F1EB" };
const STARTERS: { label: string; brief: string }[] = [
  { label: "A health companion", brief: "A wearable companion for people who train hard and want to know whether their body is ready for it. One number every morning and an honest reason behind it. Dark, data-dense, no cheerleading." },
  { label: "A banking app", brief: "A mobile banking app for people who move money between friends a few times a week. Sending a transfer should take under twenty seconds without ever feeling unsure about what happened. Calm, precise, trustworthy." },
  { label: "A recipe planner", brief: "A tablet app for planning the week's dinners from recipes you saved. Pick tonight's dish, see what to buy, and cook from a step view you can read across the kitchen. Warm, editorial, unhurried." }
];

/** A name from the first words of the brief, so starting a project is one box, not a form. */
function nameFrom(brief: string): string {
  const words = brief.replace(/^(a|an|the)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 4);
  const cut = words.findIndex((w) => /[.,;:]$/.test(w));
  const picked = (cut === -1 ? words : words.slice(0, cut + 1)).map((w) => w.replace(/[.,;:]$/, ""));
  const name = picked.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return name || "Untitled project";
}

type Device = { kind: string; width: number; height: number };

/**
 * A screen's first viewport inside a device-shaped frame. `width` is the frame; `scale` defaults to fitting the device
 * into it, and a smaller frame at a given scale shows a crop, from the right edge when `align` says so.
 */
function DeviceFrame({ src, device, width, scale, align = "left", className }: { src: string; device: Device; width: number; scale?: number; align?: "left" | "right"; className?: string }) {
  const k = scale ?? width / device.width;
  const aspect = device.kind === "mobile" ? 1.95 : device.kind === "tablet" ? 1.2 : 0.62;
  const h = Math.round(Math.min(device.height, device.width * aspect) * k);
  const left = align === "right" ? Math.min(0, width - device.width * k) : 0;
  return (
    <div className={`device ${device.kind} ${className ?? ""}`} style={{ width, height: h }}>
      <iframe title="" tabIndex={-1} loading="lazy" src={src} style={{ width: device.width, height: device.height, transform: `scale(${k})`, left }} />
    </div>
  );
}

/** The first two screens of an example, side by side, joined by one move. */
function ExamplePreview({ ex }: { ex: ExampleMeta }) {
  if (!ex.firstScreen) return null;
  const device = { kind: ex.device, width: ex.width, height: ex.height };
  const w = ex.device === "mobile" ? 108 : ex.device === "tablet" ? 150 : 232;
  const k = w / ex.width;
  return (
    <>
      <DeviceFrame src={api.exampleShellUrl(ex.id, ex.firstScreen)} device={device} width={w} />
      {ex.secondScreen && (
        <>
          <DeviceFrame src={api.exampleShellUrl(ex.id, ex.secondScreen)} device={device} width={ex.device === "desktop" ? 96 : w} scale={k} align={ex.device === "desktop" ? "right" : "left"} className="second" />
        </>
      )}
    </>
  );
}

/** A phone outline at x,y. */
function WfPhone({ x, y, w, h, className = "" }: { x: number; y: number; w: number; h: number; className?: string }) {
  return <rect className={`wf-phone ${className}`} x={x} y={y} width={w} height={h} rx={16} />;
}

/** A labelled pill sitting on a connector, the way the board labels a move. */
function WfPill({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 5.6 + 18;
  return (
    <g className="wf-pill">
      <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} />
      <text x={x} y={y + 3.6} textAnchor="middle">{text}</text>
    </g>
  );
}

/**
 * The right side of the start section: a wireframe of a flow. One screen branches to two, both lead on to a third that
 * Claude is still drafting. It says what the tool makes (a flow with paths, not a stack of screens) without being a
 * screenshot of one app.
 */
function HeroBoard() {
  const ab = "M 144 229 H 196 Q 208 229 208 217 V 132 Q 208 120 220 120 H 246";
  return (
    <div className="hero-board" aria-hidden="true">
      <svg className="wf" viewBox="0 0 520 440" width="520" height="440">
        {/* A: the home screen */}
        <text className="wf-label" x={18} y={100}>Program</text>
        <WfPhone x={16} y={108} w={128} h={256} />
        <rect className="wf-ink" x={30} y={124} width={22} height={4} rx={2} />
        <rect className="wf-ink" x={30} y={140} width={64} height={8} rx={4} />
        <rect className="wf-fill" x={30} y={156} width={100} height={52} rx={8} />
        <path className="wf-mark" d="M 30 208 L 58 182 L 76 196 L 92 184 L 130 208" />
        <rect className="wf-hot" x={24} y={216} width={112} height={26} rx={7} />
        {[229, 259, 289].map((y) => (
          <g key={y}>
            <circle className="wf-fill" cx={38} cy={y} r={7} />
            <rect className="wf-ink" x={52} y={y - 6} width={y === 229 ? 58 : 50} height={5} rx={2.5} />
            <rect className="wf-soft" x={52} y={y + 2} width={34} height={4} rx={2} />
          </g>
        ))}
        <line className="wf-rule" x1={16} y1={326} x2={144} y2={326} />
        {[40, 68, 96, 124].map((x, i) => <circle key={x} className={i === 1 ? "wf-hot-dot" : "wf-fill"} cx={x} cy={345} r={i === 1 ? 5 : 4.5} />)}

        {/* B: session (selected) */}
        <text className="wf-label" x={250} y={22}>Session</text>
        <WfPhone x={248} y={30} w={100} h={192} className="sel" />
        <rect className="wf-soft" x={284} y={40} width={28} height={4} rx={2} />
        <rect className="wf-ink" x={260} y={56} width={56} height={7} rx={3.5} />
        <rect className="wf-soft" x={260} y={68} width={40} height={4} rx={2} />
        {[88, 110, 132].map((y, i) => (
          <g key={y}>
            <rect className="wf-card" x={258} y={y} width={80} height={18} rx={5} />
            <circle className={i === 0 ? "wf-hot-dot" : "wf-fill"} cx={268} cy={y + 9} r={4} />
            <rect className="wf-ink" x={277} y={y + 7} width={30} height={4} rx={2} />
          </g>
        ))}
        <rect className="wf-fill" x={260} y={166} width={76} height={4} rx={2} />
        <rect className="wf-accent" x={260} y={166} width={44} height={4} rx={2} />
        <rect className="wf-btn" x={260} y={192} width={76} height={18} rx={9} />
        {[[244, 26], [352, 26], [244, 226], [352, 226]].map(([x, y]) => <rect key={`${x}${y}`} className="wf-handle" x={x - 3.5} y={y - 3.5} width={7} height={7} />)}

        {/* C: progress */}
        <text className="wf-label" x={250} y={252}>Progress</text>
        <WfPhone x={248} y={260} w={100} h={168} />
        <rect className="wf-ink" x={260} y={276} width={50} height={7} rx={3.5} />
        <circle className="wf-ring" cx={298} cy={322} r={20} />
        <path className="wf-ring-on" d="M 298 302 A 20 20 0 1 1 279 328" />
        {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} className={i === 4 ? "wf-accent" : "wf-fill"} x={262 + i * 13} y={392 - [14, 22, 10, 26, 30, 18][i]} width={8} height={[14, 22, 10, 26, 30, 18][i]} rx={2} />)}

        {/* D: coach, still being drafted */}
        <text className="wf-label magic" x={398} y={110}>Coach</text>
        <WfPhone x={396} y={118} w={108} h={200} className="draft" />
        <g className="wf-drafting">
          <rect className="wf-soft" x={410} y={140} width={60} height={14} rx={7} />
          <rect className="wf-fill" x={430} y={162} width={62} height={22} rx={8} />
          <rect className="wf-soft" x={410} y={192} width={70} height={14} rx={7} />
          <rect className="wf-soft" x={410} y={212} width={46} height={14} rx={7} />
          <rect className="wf-card" x={406} y={290} width={88} height={18} rx={9} />
        </g>

        {/* the moves */}
        <path className="wf-edge" d={ab} />
        <path className="wf-edge" d="M 144 345 H 196 Q 208 345 208 344 H 246" />
        <path className="wf-edge draft" d="M 348 120 H 360 Q 372 120 372 132 V 206 Q 372 218 384 218 H 394" />
        <path className="wf-edge draft" d="M 348 340 H 360 Q 372 340 372 328 V 230 Q 372 218 384 218" />
        <circle className="wf-dot" cx={144} cy={229} r={3.5} />
        <circle className="wf-dot" cx={144} cy={345} r={3.5} />
        <path className="wf-tip" d="M 240 115.5 L 246.5 120 L 240 124.5" />
        <path className="wf-tip" d="M 240 340.5 L 246.5 345 L 240 349.5" />
        <path className="wf-tip draft" d="M 388 213.5 L 394.5 218 L 388 222.5" />
        <circle className="wf-runner" r={3.5}><animateMotion dur="2.6s" repeatCount="indefinite" path={ab} /></circle>
        <WfPill x={208} y={176} text="Tap a session" />
        <WfPill x={196} y={345} text="Progress tab" />
      </svg>
      <div className="hb-cursor" style={{ left: 428, top: 246 }}>
        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 1.5 L13.5 8 L8.3 9.2 L5.6 14 Z" fill="var(--magic)" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" /></svg>
        <span>Claude</span>
      </div>
    </div>
  );
}

/**
 * Home: a workspace. Start a project from one box, get back to recent work, or begin from an example that already runs.
 */
export function ProjectHome() {
  const [examples, setExamples] = useState<ExampleMeta[]>([]);
  const [brief, setBrief] = useState("");
  const [device, setDevice] = useState<DeviceKind>("mobile");
  const [files, setFiles] = useState<File[]>([]);
  const [filter, setFilter] = useState<"all" | DeviceKind>("all");
  const [busy, setBusy] = useState(false);
  const openProject = useFlow((s) => s.openProject);
  const showToast = useFlow((s) => s.showToast);
  const error = useFlow((s) => s.error);
  const topRef = useRef<HTMLDivElement>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listExamples().then(setExamples).catch(() => setExamples([]));
  }, [showToast]);

  const create = async () => {
    if (!brief.trim()) { briefRef.current?.focus(); return; }
    setBusy(true);
    try {
      const b = await api.createProject(nameFrom(brief.trim()), brief.trim(), device);
      await openProject(b.meta.id);
      // References chosen before the project existed land on the board beside the brief.
      for (const [i, f] of files.entries()) {
        if (!f.type.startsWith("image/")) continue;
        const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });
        const { path } = await api.uploadAsset(b.meta.id, "inspirations", f.name, { dataBase64: b64 });
        useFlow.getState().updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id: `insp-${Date.now().toString(36)}${i}`, type: "inspiration", kind: "image", title: f.name.replace(/\.[^.]+$/, ""), path, caption: "", description: "", position: { x: -420, y: 260 + i * 300 }, width: 224 }] }));
      }
      if (files.length) await useFlow.getState().saveCanvasNow();
    } catch (e) { showToast((e as Error).message); }
    finally { setBusy(false); }
  };
  const loadExample = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try { const b = await api.createFromExample(id); await openProject(b.meta.id); }
    catch (e) { showToast((e as Error).message); }
    finally { setBusy(false); }
  };
  const goTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const shown = useMemo(() => examples.filter((ex) => filter === "all" || ex.device === filter), [examples, filter]);
  const kinds = useMemo(() => Array.from(new Set(examples.map((e) => e.device))) as DeviceKind[], [examples]);

  return (
    <div className="home" ref={topRef}>
      <header className="home-nav">
        <div className="hn-inner">
          <button className="brand" onClick={goTop}><span className="brand-mark" aria-hidden="true"><Icon name="hexagon" size={22} strokeWidth={2} /></span><span className="wordmark">Flow<span>Vibing</span></span></button>
          <span style={{ flex: 1 }} />
          {IS_STATIC && (
            <div className="hn-demo">
              <Icon name="info" size={15} /> <span>Explore the demo. Create with the local app.</span>
              <a href={LOCAL_APP_URL} target="_blank" rel="noreferrer">Get local app <Icon name="arrow-up-right" size={13} /></a>
            </div>
          )}
          <a className="hn-help" href="https://github.com/friedachen1234-dotcom/flow-vibing#readme" target="_blank" rel="noreferrer"><Icon name="help" size={17} /> Help</a>
        </div>
      </header>

      <div className="inner">
        <section className="start">
          <div className="start-copy">
          <h1>Every screen, and every path between them.</h1>
          <p className="lede">Describe an app and Claude drafts the flow: the screens, how they branch and where they lead, on a board you can run, rewire and refine.</p>
          {error && <p className="home-error">{error}</p>}
          <div className={`prompt ${busy ? "busy" : ""}`}>
            <textarea ref={briefRef} rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="A habit tracker for people who keep breaking streaks…"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void create(); }} />
            <div className="prompt-foot">
              <button className="attach" onClick={() => fileRef.current?.click()} title="Images you add here land on the board as references">
                <Icon name="paperclip" size={15} /> {files.length ? `${files.length} reference${files.length === 1 ? "" : "s"}` : "Reference"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              <span className="pf-sep" />
              <div className="device-pick" role="radiogroup" aria-label="Device">
                {(["mobile", "tablet", "desktop"] as DeviceKind[]).map((k) => <button key={k} role="radio" aria-checked={device === k} className={device === k ? "on" : ""} onClick={() => setDevice(k)}>{DEVICE_LABEL[k]}</button>)}
              </div>
              <span style={{ flex: 1 }} />
              <span className="kbd-hint">⌘ ↵</span>
              <button className="btn dark create" disabled={busy || !brief.trim()} onClick={create}>Create</button>
            </div>
          </div>
          <div className="starters">
            <span className="muted">Try</span>
            {STARTERS.map((st) => (
              <button key={st.label} className="starter" onClick={() => { setBrief(st.brief); briefRef.current?.focus(); }}>{st.label}</button>
            ))}
          </div>
          </div>
          <HeroBoard />
        </section>

        <section className="examples">
          <div className="sec-head">
            <h2>Examples</h2>
            <span className="muted sub">Working prototypes you can open, edit and run.</span>
            <span style={{ flex: 1 }} />
            {kinds.length > 1 && (
              <div className="text-tabs" role="radiogroup" aria-label="Device filter">
                <button role="radio" aria-checked={filter === "all"} className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All</button>
                {(["mobile", "tablet", "desktop"] as DeviceKind[]).filter((k) => kinds.includes(k)).map((k) => <button key={k} role="radio" aria-checked={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{DEVICE_LABEL[k]}</button>)}
              </div>
            )}
          </div>
          <div className="ex-grid">
            {shown.map((ex) => (
              <button key={ex.id} className={`ex ${ex.device}`} disabled={busy} onClick={() => loadExample(ex.id)}>
                <div className={`ex-stage ${ex.id === "baseline" ? "dark" : ""}`} style={EXAMPLE_TINT[ex.id] ? { background: EXAMPLE_TINT[ex.id] } : undefined}><ExamplePreview ex={ex} /></div>
                <div className="ex-foot">
                  <div className="ex-text">
                    <div className="n">{ex.name}</div>
                    <div className="m">{EXAMPLE_TITLE[ex.id] ?? DEVICE_LABEL[ex.device]} · {DEVICE_LABEL[ex.device]} · {ex.screenCount} screens</div>
                  </div>
                  <span className="open">Open <Icon name="arrow-right" size={14} /></span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
