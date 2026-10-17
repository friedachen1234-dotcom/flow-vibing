import { useRef } from "react";
import { useFlow } from "../store";
import { api } from "../api";
import { Icon } from "./Icon";

/** The tools at the start of the bottom bar: what the pointer does on the board, the two things you add by hand, and the way out to a full-screen run. */
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
    <>
      <button className={`cb-btn ${!picker && !hand && !walk.active ? "on" : ""}`} onClick={selectTool} data-tip="Select" data-key="V" aria-label="Select"><Icon name="mouse-pointer" size={16} /></button>
      <button className={`cb-btn ${hand ? "on" : ""}`} onClick={() => setHand(!hand)} data-tip="Hand · drag to pan" data-key="H" aria-label="Hand"><Icon name="hand" size={16} /></button>
      <button className={`cb-btn ${picker ? "on" : ""}`} onClick={() => setPicker(!picker)} data-tip="Pick an element" data-key="P" aria-label="Pick element" disabled={spec.screens.length === 0}><Icon name="crosshair" size={16} /></button>
      <span className="cb-sep" />
      <button className="cb-btn" onClick={addNote} data-tip="Add a note" data-key="N" aria-label="Add note"><Icon name="sticky-note" size={16} /></button>
      <button className="cb-btn" onClick={() => fileRef.current?.click()} data-tip="Add a reference image or skill" aria-label="Add reference"><Icon name="image" size={16} /></button>
      <input ref={fileRef} type="file" accept="image/*,.md,.markdown" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <span className="cb-sep" />
      <button className={`cb-btn ${walk.active ? "on" : ""}`} onClick={() => setWalk({ active: !walk.active, screenId: walk.active ? null : (spec.screens[0]?.id ?? null), stateId: null, lastTransitionId: null })} data-tip="Run the prototype full screen" data-key="W" aria-label="Present walkthrough" disabled={spec.screens.length === 0}><Icon name="play" size={16} /></button>
      <span className="cb-sep" />
    </>
  );
}
