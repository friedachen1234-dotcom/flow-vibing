import { useEffect, useRef, useState } from "react";
import { useFlow } from "../store";
import { api } from "../api";
import { Icon } from "./Icon";

type Item = { icon?: string; label: string; key?: string; checked?: boolean; disabled?: boolean; onClick: () => void };
type Group = Item[];

/** A menu that opens to the right of the rail, Figma-style: icon, label, shortcut, a check for what is on. */
function RailMenu({ groups, onClose }: { groups: Group[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <div className="rail-menu" ref={ref} role="menu">
      {groups.map((g, i) => (
        <div key={i} className="rm-group">
          {g.map((it) => (
            <button key={it.label} role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={it.checked} disabled={it.disabled} onClick={() => { it.onClick(); onClose(); }}>
              <span className="rm-check">{it.checked && <Icon name="check" size={13} strokeWidth={2.2} />}</span>
              {it.icon && <Icon name={it.icon} size={15} />}
              <span className="rm-label">{it.label}</span>
              {it.key && <span className="rm-key">{it.key}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A rail button that opens a menu. With `split`, the button itself acts and the chevron beside it opens the menu. */
function MenuButton({ icon, label, tip, keyHint, on, split, onAct, groups, children }: { icon?: string; label: string; tip: string; keyHint?: string; on?: boolean; split?: boolean; onAct?: () => void; groups: Group[]; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rail-tool ${open ? "open" : ""}`}>
      <button className={`cb-btn ${on ? "on" : ""}`} onClick={() => (split && onAct ? onAct() : setOpen(!open))} data-tip={open ? undefined : tip} data-key={open ? undefined : keyHint} aria-label={label} aria-haspopup={!split} aria-expanded={!split ? open : undefined}>
        {children ?? (icon && <Icon name={icon} size={16} />)}
      </button>
      <button className="rail-caret" onClick={() => setOpen(!open)} aria-label={`${label} options`} aria-haspopup aria-expanded={open}><Icon name="chevron-right" size={10} strokeWidth={2.4} /></button>
      {open && <RailMenu groups={groups} onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * The left rail, grouped the way design tools group it: what the pointer does, what you can add, then how you look at
 * the board (zoom and view). Each group is one button; the choices live in its menu, so nothing on the rail toggles
 * on and off by itself. Running the prototype lives in the top bar.
 */
export function ToolRail({ zoom, onZoomIn, onZoomOut, onZoom100, onFit, onTidy, canTidy, onKeys }: { zoom: number; onZoomIn: () => void; onZoomOut: () => void; onZoom100: () => void; onFit: () => void; onTidy: () => void; canTidy: boolean; onKeys: () => void }) {
  const picker = useFlow((s) => s.picker.enabled);
  const setPicker = useFlow((s) => s.setPicker);
  const hand = useFlow((s) => s.hand);
  const setHand = useFlow((s) => s.setHand);
  const walk = useFlow((s) => s.walk);
  const setWalk = useFlow((s) => s.setWalk);
  const spec = useFlow((s) => s.bundle!.spec);
  const view = useFlow((s) => s.view);
  const projectId = useFlow((s) => s.projectId)!;
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const run = useFlow((s) => s.run);
  const showMinimap = useFlow((s) => s.showMinimap);
  const setShowMinimap = useFlow((s) => s.setShowMinimap);
  const showInfluences = useFlow((s) => s.showInfluences);
  const setShowInfluences = useFlow((s) => s.setShowInfluences);
  const showEdgeCases = useFlow((s) => s.showEdgeCases);
  const setShowEdgeCases = useFlow((s) => s.setShowEdgeCases);
  const imageRef = useRef<HTMLInputElement>(null);
  const skillRef = useRef<HTMLInputElement>(null);

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
  const stopWalk = () => { if (walk.active) setWalk({ active: false, screenId: null, stateId: null, lastTransitionId: null }); };
  const mode: "select" | "hand" | "pick" = picker ? "pick" : hand ? "hand" : "select";
  const setMode = (m: typeof mode) => { stopWalk(); setPicker(m === "pick"); setHand(m === "hand"); };
  const modeIcon = { select: "mouse-pointer", hand: "hand", pick: "crosshair" }[mode];
  const modeTip = { select: "Select", hand: "Hand · drag to pan", pick: "Pick an element" }[mode];
  const modeKey = { select: "V", hand: "H", pick: "P" }[mode];

  return (
    <>
      <MenuButton icon={modeIcon} label="Pointer" tip={modeTip} keyHint={modeKey} on split onAct={() => setMode(mode)} groups={[[
        { icon: "mouse-pointer", label: "Select", key: "V", checked: mode === "select", onClick: () => setMode("select") },
        { icon: "hand", label: "Hand", key: "H", checked: mode === "hand", onClick: () => setMode("hand") },
        { icon: "crosshair", label: "Pick an element", key: "P", checked: mode === "pick", disabled: spec.screens.length === 0, onClick: () => setMode("pick") }
      ]]} />
      <MenuButton icon="plus" label="Add" tip="Add to the board" groups={[[
        { icon: "sticky-note", label: "Sticky note", key: "N", onClick: addNote },
        { icon: "image", label: "Reference image…", onClick: () => imageRef.current?.click() },
        { icon: "sliders", label: "Skill from a .md file…", onClick: () => skillRef.current?.click() }
      ]]} />
      <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={skillRef} type="file" accept=".md,.markdown" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      <span className="cb-sep" />
      <MenuButton label="Zoom" tip="Zoom and layout" groups={[
        [
          { label: "Zoom in", key: "+", onClick: onZoomIn },
          { label: "Zoom out", key: "−", onClick: onZoomOut },
          { label: "Zoom to 100%", key: "⌘0", onClick: onZoom100 },
          { label: "Zoom to fit", key: "⇧1", onClick: onFit }
        ],
        [{ icon: "layout-grid", label: "Tidy the layout", disabled: !canTidy, onClick: onTidy }]
      ]}>
        <span className="cb-zoom-label">{Math.round(zoom * 100)}%</span>
      </MenuButton>
      <MenuButton icon="eye" label="View" tip="What the board shows" groups={[[
        { label: "Minimap", checked: showMinimap, onClick: () => setShowMinimap(!showMinimap) },
        { label: "Which references shaped each screen", checked: showInfluences, onClick: () => setShowInfluences(!showInfluences) },
        ...(view === "flow" && spec.edgeCases.length > 0 ? [{ label: "Edge cases", key: "E", checked: showEdgeCases, onClick: () => setShowEdgeCases(!showEdgeCases) }] : [])
      ]]} />
      <span style={{ flex: 1 }} />
      <span className="cb-sep" />
      <button className="cb-btn cb-keys" onClick={onKeys} data-tip="Keyboard shortcuts" data-key="?" aria-label="Keyboard shortcuts">?</button>
    </>
  );
}
