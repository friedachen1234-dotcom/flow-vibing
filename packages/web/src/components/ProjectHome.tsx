import { useEffect, useState } from "react";
import type { DeviceKind, ProjectMeta } from "@flow/shared";
import { api, type ExampleMeta } from "../api";
import { useFlow } from "../store";

const DEVICE_LABEL: Record<DeviceKind, string> = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" };

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

  return (
    <div className="home">
      <div className="inner">
        <div>
          <h1>Flow <span>Vibing</span></h1>
          <p className="lede">Prototypes that are also flows. Write a brief, let Claude build the screens, then edit the flow chart or the prototype and regenerate only what changed.</p>
          {error && <p style={{ color: "var(--err)" }}>{error}</p>}
        </div>
        <div className="grid">
          <div className="card">
            <h2>New project</h2>
            <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Corner Coffee ordering" /></div>
            <div className="field"><label>Brief</label><textarea className="input" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Who it is for, what they need to do, and the feeling it should have. You can refine it on the canvas." /></div>
            <div className="field"><label>Device</label>
              <select className="input" value={device} onChange={(e) => setDevice(e.target.value as DeviceKind)}>
                <option value="mobile">Mobile · 390×844</option>
                <option value="tablet">Tablet · 820×1180</option>
                <option value="desktop">Desktop · 1280×800</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" disabled={busy || !name.trim()} onClick={create}>Create project</button>
              <button className="btn" disabled={busy} onClick={demo}>Open demo project</button>
            </div>
          </div>
          <div className="card">
            <h2>Recent</h2>
            {projects.length === 0 && <div className="muted small">No projects yet. Create one, or open the demo to see the canvas working without Claude.</div>}
            {projects.map((p) => (
              <div key={p.id} className="proj" onClick={() => openProject(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openProject(p.id)}>
                <div className="n">{p.name}</div>
                <div className="m">{p.screenCount} screens · {new Date(p.updatedAt).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
          {examples.length > 0 && (
            <div className="card examples">
              <h2>Example prototypes</h2>
              <div className="muted small" style={{ marginBottom: 10 }}>Hand-built prototypes that follow the screen contract. Load one to try navigation, states, branches, the picker, and change requests without Claude.</div>
              <div className="ex-grid">
                {examples.map((ex) => (
                  <div key={ex.id} className="ex">
                    <div className="ex-head">
                      <div className="n">{ex.name}</div>
                      <div className="m">{DEVICE_LABEL[ex.device]} · {ex.screenCount} screens</div>
                    </div>
                    <div className="ex-brief">{ex.brief}</div>
                    <button className="btn sm" disabled={busy} onClick={() => loadExample(ex.id)}>Load example</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
