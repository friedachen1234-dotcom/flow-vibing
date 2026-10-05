import { useEffect, useRef, useState } from "react";
import type { DeviceKind, ProjectMeta } from "@flow/shared";
import { api, type ExampleMeta } from "../api";
import { useFlow } from "../store";
import { Icon } from "./Icon";

const DEVICE_LABEL: Record<DeviceKind, string> = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" };
/** Example cards are a fixed width so each live frame can be scaled exactly; wide devices take two columns. */
const CARD_W = 272;
const CARD_GAP = 16;
const FRAME_H = 320;

/**
 * Home: the one page that has to explain the product. It leads with the thesis and examples that actually run,
 * then the two things a person comes here to do: start a project, or get back to one.
 */
export function ProjectHome() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [examples, setExamples] = useState<ExampleMeta[]>([]);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [device, setDevice] = useState<DeviceKind>("mobile");
  const [busy, setBusy] = useState(false);
  const openProject = useFlow((s) => s.openProject);
  const showToast = useFlow((s) => s.showToast);
  const error = useFlow((s) => s.error);
  const formRef = useRef<HTMLElement>(null);
  const examplesRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listProjects().then(setProjects).catch((e) => showToast(e.message));
    api.listExamples().then(setExamples).catch(() => setExamples([]));
  }, [showToast]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { const b = await api.createProject(name.trim(), brief.trim(), device); await openProject(b.meta.id); }
    catch (e) { showToast((e as Error).message); }
    finally { setBusy(false); }
  };
  const demo = async () => {
    setBusy(true);
    try { const b = await api.createDemo(); await openProject(b.meta.id); }
    catch (e) { showToast((e as Error).message); }
    finally { setBusy(false); }
  };
  const loadExample = async (id: string) => {
    setBusy(true);
    try { const b = await api.createFromExample(id); await openProject(b.meta.id); }
    catch (e) { showToast((e as Error).message); }
    finally { setBusy(false); }
  };
  // Plain scrolling rather than hash links: the hash is how the app routes to a project.
  const goNew = () => { formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => nameRef.current?.focus(), 350); };
  const goExamples = () => examplesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="home">
      <div className="inner">
        <header className={`hero ${projects.length ? "with-recent" : ""}`}>
          <div className="hero-copy">
            <div className="wordmark hero-mark" aria-hidden="true">Flow<span>Vibing</span></div>
            <h1>Every prototype is also a flow.</h1>
            <p className="lede">
              Write a brief. Claude writes the design spec and the screens together, so the flow chart and the running prototype are the same files.
              Edit either one and only what changed is regenerated. Every change is a version.
            </p>
            {error && <p className="home-error">{error}</p>}
            <div className="hero-actions">
              <button className="btn primary cta" onClick={goNew}><Icon name="sparkles" size={15} /> New project</button>
              <button className="btn" onClick={goExamples}><Icon name="play" size={14} /> Try a live example</button>
            </div>
          </div>
          {projects.length > 0 && (
            <aside className="card recent" aria-label="Recent projects">
              <h2>Recent</h2>
              {projects.slice(0, 6).map((p) => (
                <div key={p.id} className="proj" onClick={() => openProject(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openProject(p.id)}>
                  <div className="n">{p.name}</div>
                  <div className="m">{p.screenCount} screen{p.screenCount === 1 ? "" : "s"} · {new Date(p.updatedAt).toLocaleDateString()}</div>
                </div>
              ))}
            </aside>
          )}
        </header>

        {examples.length > 0 && (
          <section ref={examplesRef} className="sec">
            <div className="sec-head">
              <h2>Examples that run</h2>
              <span className="muted small">These are the real screens, live. Tap inside one to move through it, or open it on the canvas to edit.</span>
            </div>
            <div className="ex-grid" style={{ gridTemplateColumns: `repeat(auto-fit, ${CARD_W}px)`, gap: CARD_GAP }}>
              {examples.map((ex) => {
                const span = ex.device === "mobile" ? 1 : 2;
                const frameW = span * CARD_W + (span - 1) * CARD_GAP - 2;
                const scale = frameW / ex.width;
                const frameH = Math.min(FRAME_H, Math.round(ex.height * scale));
                return (
                  <article key={ex.id} className="ex" style={{ gridColumn: `span ${span}` }}>
                    <div className="ex-frame" style={{ height: frameH }}>
                      {ex.firstScreen && (
                        <iframe title={`${ex.name} prototype`} loading="lazy" src={api.exampleShellUrl(ex.id, ex.firstScreen)}
                          style={{ width: ex.width, height: ex.height, transform: `scale(${scale})` }} />
                      )}
                      <span className="ex-live"><span className="dot" /> live</span>
                    </div>
                    <div className="ex-body">
                      <div className="ex-head">
                        <div className="n">{ex.name}</div>
                        <div className="m">{DEVICE_LABEL[ex.device]} · {ex.screenCount} screens</div>
                      </div>
                      <p className="ex-brief">{ex.brief}</p>
                      <button className="btn sm primary" disabled={busy} onClick={() => loadExample(ex.id)}>Open on the canvas</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section ref={formRef} className="card new">
          <h2>New project</h2>
          <div className="new-grid">
            <div className="field"><label>Name</label><input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Corner Coffee ordering" /></div>
            <div className="field"><label>Device</label>
              <select className="input" value={device} onChange={(e) => setDevice(e.target.value as DeviceKind)}>
                <option value="mobile">Mobile · 390×844</option>
                <option value="tablet">Tablet · 820×1180</option>
                <option value="desktop">Desktop · 1280×800</option>
              </select>
            </div>
            <div className="field span"><label>Brief</label><textarea className="input" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Who it is for, what they need to do, and the feeling it should have. You can refine it on the canvas." /></div>
          </div>
          <div className="new-actions">
            <button className="btn primary" disabled={busy || !name.trim()} onClick={create}>Create project</button>
            <span className="muted small">Generation uses your Claude Code login. Nothing is stored here. The examples above run without it.</span>
          </div>
        </section>

        <footer className="home-foot muted small">
          Projects are folders under <span className="mono">./projects</span>, each its own git repository.
          {" "}Just want placeholder screens? <button className="link" disabled={busy} onClick={demo}>Open the bare demo</button>.
        </footer>
      </div>
    </div>
  );
}
