import { useEffect } from "react";
import { useFlow } from "./store";
import { ProjectHome } from "./components/ProjectHome";
import { TopBar } from "./components/TopBar";
import { ToolRail } from "./components/ToolRail";
import { Canvas } from "./canvas/Canvas";
import { RightPanel } from "./components/RightPanel";
import { VersionPreview } from "./components/VersionBar";
import { DialogHost } from "./components/Dialog";
import { Present } from "./components/Present";
import { Icon } from "./components/Icon";

export function App() {
  const projectId = useFlow((s) => s.projectId);
  const bundle = useFlow((s) => s.bundle);
  const toast = useFlow((s) => s.toast);
  const previewVersion = useFlow((s) => s.previewVersion);
  const openProject = useFlow((s) => s.openProject);
  const presenting = useFlow((s) => s.walk.active);

  useEffect(() => {
    const sync = () => {
      const id = location.hash.replace(/^#/, "");
      const cur = useFlow.getState().projectId;
      if (id && id !== cur) void openProject(id);
      else if (!id && cur) useFlow.getState().closeProject();
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toastEl = toast && (
    <div className="toast" role="status">
      <span className="tick"><Icon name={/fail|could not|error/i.test(toast) ? "alert" : "check-circle"} size={16} /></span>
      <span>{toast}</span>
      <button className="close" onClick={() => useFlow.setState({ toast: null })} aria-label="Dismiss"><Icon name="x" size={13} /></button>
    </div>
  );
  if (!projectId || !bundle) return <><ProjectHome />{toastEl}<DialogHost /></>;
  return (
    <div className="app">
      <TopBar />
      <main className="canvas-wrap">
        <Canvas />
        <ToolRail />
        <RightPanel />
      </main>
      {previewVersion && <VersionPreview sha={previewVersion} />}
      {presenting && <Present />}
      {toastEl}
      <DialogHost />
    </div>
  );
}
