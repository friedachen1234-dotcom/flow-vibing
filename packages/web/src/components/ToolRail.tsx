import { useRef } from "react";
import { useFlow } from "../store";
import { api } from "../api";
import { Icon } from "./Icon";

/** Left rail: what the pointer does on the board, then the two things you add by hand, then the way out to a full-screen run. */
export function ToolRail() {
  const picker = useFlow((s) => s.picker.enabled);
  const setPicker = useFlow((s) => s.setPicker);
  const hand = useFlow((s) => s.hand);
  const setHand = useFlow((s) => s.setHand);
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
  const selectTool = () => { setPicker(false); setHand(false); if (walk.active) setWalk({ active: false, screenId: null, stateId: null, lastTransitionId: null }); };

  return (
    <nav className="rail" aria-label="Tools">
      <button className={`rail-btn ${!picker && !hand && !walk.active ? "on" : ""}`} onClick={selectTool} title="Select (V)" aria-label="Select"><Icon name="mouse-pointer" size={18} /></button>
      <button className={`rail-btn ${hand ? "on" : ""}`} onClick={() => setHand(!hand)} title="Hand: drag anywhere to pan (H)" aria-label="Hand"><Icon name="hand" size={18} /></button>
      <button className={`rail-btn ${picker ? "on" : ""}`} onClick={() => setPicker(!picker)} title="Pick an element inside a prototype (P)" aria-label="Pick element" disabled={spec.screens.length === 0}><Icon name="crosshair" size={18} /></button>
      <div className="rail-sep" />
      <button className="rail-btn" onClick={addNote} title="Add a note (N)" aria-label="Add note"><Icon name="sticky-note" size={18} /></button>
      <button className="rail-btn" onClick={() => fileRef.current?.click()} title="Add a reference image or a markdown skill" aria-label="Add reference"><Icon name="image" size={18} /></button>
      <input ref={fileRef} type="file" accept="image/*,.md,.markdown" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <div className="rail-sep" />
      <button className={`rail-btn ${walk.active ? "on" : ""}`} onClick={() => setWalk({ active: !walk.active, screenId: walk.active ? null : (spec.screens[0]?.id ?? null), stateId: null, lastTransitionId: null })} title="Present: walk through the flow full screen (W)" aria-label="Present walkthrough" disabled={spec.screens.length === 0}><Icon name="play" size={18} /></button>
    </nav>
  );
}
