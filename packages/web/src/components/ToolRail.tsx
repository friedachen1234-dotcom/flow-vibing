import { useRef } from "react";
import { useFlow } from "../store";
import { api } from "../api";
import { Icon } from "./Icon";

/** Left rail: what the pointer does on the canvas, plus the two things you add by hand. */
export function ToolRail() {
  const picker = useFlow((s) => s.picker.enabled);
  const setPicker = useFlow((s) => s.setPicker);
  const walk = useFlow((s) => s.walk);
  const setWalk = useFlow((s) => s.setWalk);
  const spec = useFlow((s) => s.bundle!.spec);
  const projectId = useFlow((s) => s.projectId)!;
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const run = useFlow((s) => s.run);
  const fileRef = useRef<HTMLInputElement>(null);

  const centre = () => { const c = useFlow.getState().bundle!.canvas; return { x: -c.viewport.x / c.viewport.zoom + 120, y: -c.viewport.y / c.viewport.zoom + 120 }; };
  const addNote = () => updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id: `note-${Date.now().toString(36)}`, type: "note", text: "", position: centre(), width: 240 }] }));
  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const [i, f] of Array.from(files).entries()) {
      const p = { x: centre().x + i * 30, y: centre().y + i * 30 };
      if (f.type.startsWith("image/")) {
        const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });
        const { path } = await api.uploadAsset(projectId, "inspirations", f.name, { dataBase64: b64 });
        const id = `insp-${Date.now().toString(36)}${i}`;
        updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id, type: "inspiration", kind: "image", title: f.name.replace(/\.[^.]+$/, ""), path, caption: "", description: "", position: p, width: 240 }] }));
        await useFlow.getState().saveCanvasNow();
        if (!useFlow.getState().agent.running) run("describe", { nodeId: id }, `Describe "${f.name}"`);
      } else if (/\.(md|markdown)$/i.test(f.name)) {
        const text = await f.text();
        const { path } = await api.uploadAsset(projectId, "skills", f.name, { text });
        updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id: `skill-${Date.now().toString(36)}${i}`, type: "skill", path, title: text.match(/^#\s+(.+)$/m)?.[1] ?? f.name.replace(/\.[^.]+$/, ""), position: p }] }));
      }
    }
  };

  return (
    <nav className="rail" aria-label="Tools">
      <button className={`rail-btn ${!picker && !walk.active ? "on" : ""}`} onClick={() => { setPicker(false); if (walk.active) setWalk({ active: false, screenId: null, stateId: null, lastTransitionId: null }); }} title="Select (V)" aria-label="Select"><Icon name="mouse-pointer" /></button>
      <button className={`rail-btn ${picker ? "on" : ""}`} onClick={() => setPicker(!picker)} title="Pick an element inside a prototype (P)" aria-label="Pick element" disabled={spec.screens.length === 0}><Icon name="crosshair" /></button>
      <button className={`rail-btn ${walk.active ? "on" : ""}`} onClick={() => setWalk({ active: !walk.active, screenId: walk.active ? null : (spec.screens[0]?.id ?? null), stateId: null, lastTransitionId: null })} title="Present: walk through the flow full screen (W)" aria-label="Present walkthrough" disabled={spec.screens.length === 0}><Icon name="play" /></button>
      <div className="rail-sep" />
      <button className="rail-btn" onClick={addNote} title="Add a note (N)" aria-label="Add note"><Icon name="sticky-note" /></button>
      <button className="rail-btn" onClick={() => fileRef.current?.click()} title="Add a reference image or a markdown skill (R)" aria-label="Add reference"><Icon name="image" /></button>
      <input ref={fileRef} type="file" accept="image/*,.md,.markdown" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
    </nav>
  );
}
