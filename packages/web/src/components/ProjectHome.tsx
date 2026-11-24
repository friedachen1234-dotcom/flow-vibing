import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceKind } from "@flow/shared";
import { api, type ExampleMeta } from "../api";
import { useFlow } from "../store";
import { Icon } from "./Icon";
import { IS_STATIC, LOCAL_APP_URL } from "../static";

const DEVICE_LABEL: Record<DeviceKind, string> = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" };
/** What each example is, for the card; the product name inside stays its own. */
const EXAMPLE_TITLE: Record<string, string> = { baseline: "Health companion", "lumen-bank": "Everyday banking", plated: "Recipe collection", "relay-desk": "Support inbox" };
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

/**
 * The right side of the start section: a corner of a real board. Two live screens from an example, the move between
 * them drawn the way the canvas draws it, a selected frame, and a sticky note. It shows what the tool is by being it.
 */
function HeroBoard({ ex }: { ex?: ExampleMeta }) {
  if (!ex?.firstScreen || !ex.secondScreen || ex.device !== "mobile") return <div className="hero-board empty" aria-hidden="true" />;
  const device = { kind: ex.device, width: ex.width, height: ex.height };
  const first = ex.firstScreen, second = ex.secondScreen;
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return (
    <div className="hero-board" aria-hidden="true">
      <div className="hb-frame" style={{ left: 28, top: 58 }}>
        <div className="hb-label">{cap(first)}</div>
        <DeviceFrame src={api.exampleShellUrl(ex.id, first)} device={device} width={160} />
      </div>
      <div className="hb-frame selected" style={{ left: 318, top: 26 }}>
        <div className="hb-label">{cap(second)}</div>
        <div className="hb-dev">
          <DeviceFrame src={api.exampleShellUrl(ex.id, second)} device={device} width={160} />
          <span className="hb-h tl" /><span className="hb-h tr" /><span className="hb-h bl" /><span className="hb-h br" />
        </div>
      </div>
      <svg className="hb-lines" viewBox="0 0 520 440" width="520" height="440">
        <path d="M 188 196 H 236 Q 248 196 248 184 V 158 Q 248 146 260 146 H 314" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="188" cy="196" r="4" fill="var(--accent)" stroke="#fff" strokeWidth="1.5" />
        <path d="M 307 141.5 L 314 146 L 307 150.5" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="hb-runner" r="3.5" fill="var(--accent)"><animateMotion dur="2.4s" repeatCount="indefinite" path="M 188 196 H 236 Q 248 196 248 184 V 158 Q 248 146 260 146 H 314" /></circle>
      </svg>
      <span className="hb-pill" style={{ left: 196, top: 206 }}>Tap the ring</span>
      <div className="hb-sticky" style={{ left: 236, top: 330 }}>Ring could take more room. Try a full-width version?</div>
      <div className="hb-cursor" style={{ left: 452, top: 300 }}>
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
          <h1>Describe an app.<br /><span>Get the whole flow.</span></h1>
          <p className="lede">Claude drafts every screen and the moves between them, on one board you can run, rewire and refine.</p>
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
          <HeroBoard ex={examples.find((e) => e.id === "baseline") ?? examples.find((e) => e.device === "mobile")} />
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
