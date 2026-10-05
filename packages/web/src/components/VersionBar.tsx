import { useEffect, useState } from "react";
import type { DesignSpec } from "@flow/shared";
import { api } from "../api";
import { useFlow } from "../store";
import { ask, confirm } from "./Dialog";

export function VersionPreview({ sha }: { sha: string }) {
  const projectId = useFlow((s) => s.projectId)!;
  const versions = useFlow((s) => s.bundle!.versions);
  const setPreviewVersion = useFlow((s) => s.setPreviewVersion);
  const restoreVersion = useFlow((s) => s.restoreVersion);
  const pinVersion = useFlow((s) => s.pinVersion);
  const updateCanvas = useFlow((s) => s.updateCanvas);
  const [spec, setSpec] = useState<DesignSpec | null>(null);
  const [missing, setMissing] = useState(false);
  const v = versions.find((x) => x.id === sha);
  const isHead = versions[0]?.id === sha;
  useEffect(() => {
    setSpec(null); setMissing(false);
    fetch(api.versionFileUrl(projectId, sha, "flow.json")).then((r) => (r.ok ? r.json() : Promise.reject())).then(setSpec).catch(() => setMissing(true));
  }, [projectId, sha]);
  const pinToCanvas = async () => {
    const label = await ask("Label this version", { initial: v?.label ?? v?.summary ?? sha.slice(0, 7) });
    if (!label) return;
    void pinVersion(sha, true, label);
    updateCanvas((c) => ({ ...c, nodes: [...c.nodes, { id: `pin-${sha.slice(0, 8)}`, type: "versionPin", versionId: sha, label, position: { x: -c.viewport.x / c.viewport.zoom + 120, y: -c.viewport.y / c.viewport.zoom + 120 } }] }));
    setPreviewVersion(null);
  };
  return (
    <div className="backdrop" onClick={() => setPreviewVersion(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="hdr">
          <span className="pill grey">{v?.kind}</span>{v?.label ?? v?.summary}<span className="mono muted">{sha.slice(0, 7)} · {v && new Date(v.createdAt).toLocaleString()}</span>
          <span className="x" style={{ display: "flex", gap: 6 }}>
            <button className="btn sm" onClick={pinToCanvas}>Pin to canvas</button>
            {!isHead && <button className="btn sm primary" onClick={async () => (await confirm("Restore this version?", "The current state stays in history as its own version.")) && restoreVersion(sha)}>Restore</button>}
            <button className="btn sm ghost" onClick={() => setPreviewVersion(null)}>Close</button>
          </span>
        </div>
        <div className="body">
          {missing && <div className="muted">This version has no flow.json.</div>}
          {spec && spec.screens.length === 0 && <div className="muted">No screens in this version.</div>}
          {spec && (
            <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8 }}>
              {spec.screens.map((s) => (
                <div key={s.id} style={{ flex: "none" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{s.name}</div>
                  <div style={{ width: spec.device.width * 0.5, height: spec.device.height * 0.5, overflow: "hidden", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}>
                    <iframe title={s.name} src={api.shellUrl(projectId, s.id, { version: sha })} style={{ width: spec.device.width, height: spec.device.height, transform: "scale(.5)", transformOrigin: "0 0", border: 0 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
