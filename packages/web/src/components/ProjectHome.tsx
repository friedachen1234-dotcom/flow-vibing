import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceKind } from "@flow/shared";
import { api, type ExampleMeta } from "../api";
import { useFlow } from "../store";
import { Icon } from "./Icon";
import { IS_STATIC, LOCAL_APP_URL } from "../static";

const DEVICE_LABEL: Record<DeviceKind, string> = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" };
/** What each example is, for the card; the product name inside stays its own. */
const EXAMPLE_TITLE: Record<string, string> = { baseline: "Health companion", "lumen-bank": "Everyday banking", plated: "Recipe collection", "relay-desk": "Support inbox" };
const STARTERS: { icon: string; label: string; brief: string }[] = [
  { icon: "heart", label: "A health companion", brief: "A wearable companion for people who train hard and want to know whether their body is ready for it. One number every morning and an honest reason behind it. Dark, data-dense, no cheerleading." },
  { icon: "card", label: "A banking app", brief: "A mobile banking app for people who move money between friends a few times a week. Sending a transfer should take under twenty seconds without ever feeling unsure about what happened. Calm, precise, trustworthy." },
  { icon: "plus", label: "Start from scratch", brief: "" }
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
          <svg className="ex-link" viewBox="0 0 56 44" aria-hidden="true">
            <path d="M5 10 C 30 10, 26 34, 51 34" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="5" cy="10" r="4" fill="currentColor" />
            <circle cx="51" cy="34" r="4" fill="currentColor" />
          </svg>
          <DeviceFrame src={api.exampleShellUrl(ex.id, ex.secondScreen)} device={device} width={ex.device === "desktop" ? 96 : w} scale={k} align={ex.device === "desktop" ? "right" : "left"} className="second" />
        </>
      )}
    </>
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
  const examplesRef = useRef<HTMLElement>(null);
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
  const demo = async () => {
    setBusy(true);
    try { const b = await api.createDemo(); await openProject(b.meta.id); }
    catch (e) { showToast((e as Error).message); }
    finally { setBusy(false); }
  };
  const goExamples = () => examplesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const goTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const shown = useMemo(() => examples.filter((ex) => filter === "all" || ex.device === filter), [examples, filter]);
  const kinds = useMemo(() => Array.from(new Set(examples.map((e) => e.device))) as DeviceKind[], [examples]);

  return (
    <div className="home" ref={topRef}>
      <header className="home-nav">
        <div className="hn-inner">
          <button className="brand" onClick={goTop}><span className="brand-mark" aria-hidden="true"><Icon name="hexagon" size={22} strokeWidth={2} /></span><span className="wordmark">Flow<span>Vibing</span></span></button>
          <span className="tb-sep" />
          <nav className="hn-tabs" aria-label="Sections">
            <button className="on" onClick={goTop}>Projects</button>
            <button onClick={goExamples}>Examples</button>
          </nav>
          <span style={{ flex: 1 }} />
          {IS_STATIC && (
            <div className="hn-demo">
              <Icon name="info" size={15} /> <span>Explore the demo. Create with the local app.</span>
              <a href={LOCAL_APP_URL} target="_blank" rel="noreferrer">Get local app <Icon name="arrow-up-right" size={13} /></a>
            </div>
          )}
          <a className="hn-help" href="https://github.com/friedachen1234-dotcom/flow-vibing#readme" target="_blank" rel="noreferrer"><Icon name="help" size={17} /> Help</a>
          <span className="avatar" aria-hidden="true"><Icon name="user" size={16} /></span>
        </div>
      </header>

      <div className="inner">
        <section className="hero">
          <div className="hero-mark" aria-hidden="true"><Icon name="flow" size={40} strokeWidth={1.6} /></div>
          <div className="eyebrow"><span>Idea</span><Icon name="arrow-right" size={11} /><span>Screens</span><Icon name="arrow-right" size={11} /><span>Flow</span></div>
          <h1>Every prototype.<br />Connected to its flow.</h1>
          <p className="lede">Shape screens and flows together on one canvas.</p>
          {error && <p className="home-error">{error}</p>}
          <div className={`prompt ${busy ? "busy" : ""}`}>
            <textarea ref={briefRef} rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What would you like to prototype?"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void create(); }} />
            <div className="prompt-foot">
              <button className="attach" onClick={() => fileRef.current?.click()} title="Images you add here land on the board as references">
                <Icon name="paperclip" size={16} /> {files.length ? `${files.length} reference${files.length === 1 ? "" : "s"}` : "Add a reference"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
              <div className="seg mini" role="radiogroup" aria-label="Device">
                {(["mobile", "tablet", "desktop"] as DeviceKind[]).map((k) => <button key={k} role="radio" aria-checked={device === k} className={device === k ? "on" : ""} onClick={() => setDevice(k)}>{DEVICE_LABEL[k]}</button>)}
              </div>
              <span style={{ flex: 1 }} />
              <button className="btn primary create" disabled={busy} onClick={create}>Create project <Icon name="arrow-up-right" size={15} /></button>
            </div>
          </div>
          <div className="starters">
            {STARTERS.map((st) => (
              <button key={st.label} className="starter" onClick={() => { setBrief(st.brief); briefRef.current?.focus(); }}><Icon name={st.icon} size={15} /> {st.label}</button>
            ))}
          </div>
        </section>

        <section ref={examplesRef} className="examples">
          <div className="sec-head">
            <h2>Start with a working example</h2>
            <span className="muted sub">Explore a live prototype, then make it yours.</span>
            <span style={{ flex: 1 }} />
            {kinds.length > 1 && (
              <div className="seg" role="radiogroup" aria-label="Device filter">
                <button role="radio" aria-checked={filter === "all"} className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All</button>
                {(["mobile", "tablet", "desktop"] as DeviceKind[]).map((k) => <button key={k} role="radio" aria-checked={filter === k} className={filter === k ? "on" : ""} disabled={!kinds.includes(k)} onClick={() => setFilter(k)}>{DEVICE_LABEL[k]}</button>)}
              </div>
            )}
          </div>
          <div className="ex-grid">
            {shown.map((ex) => (
              <article key={ex.id} className={`ex ${ex.device}`} onClick={() => loadExample(ex.id)}>
                <div className="ex-stage"><ExamplePreview ex={ex} /></div>
                <div className="ex-foot">
                  <div className="ex-text">
                    <div className="n">{EXAMPLE_TITLE[ex.id] ?? ex.name}</div>
                    <div className="m">{DEVICE_LABEL[ex.device]} · {ex.screenCount} screens</div>
                  </div>
                  <button className="open" disabled={busy} onClick={(e) => { e.stopPropagation(); void loadExample(ex.id); }}>Open example <Icon name="arrow-up-right" size={15} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="home-foot muted small">
          Projects are folders under <span className="mono">./projects</span>, each its own git repository. Generation uses your Claude Code login; the examples run without it.
          {" "}Just want placeholder screens? <button className="link" disabled={busy} onClick={demo}>Open the bare demo</button>.
        </footer>
      </div>
    </div>
  );
}
