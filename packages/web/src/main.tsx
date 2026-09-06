import React from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { App } from "./App";

/** Last line of defence: show the crash instead of a blank page, with the component stack for debugging. */
class Crash extends React.Component<{ children: React.ReactNode }, { error: Error | null; stack: string }> {
  state = { error: null as Error | null, stack: "" };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { this.setState({ error, stack: info.componentStack ?? "" }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 900 }}>
        <h2 style={{ margin: "0 0 8px" }}>FLOW hit an error</h2>
        <p style={{ color: "#4A5260" }}>Reload the page. If it keeps happening, the details below help fix it.</p>
        <pre id="crash" style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#fff", padding: 16, borderRadius: 8, border: "1px solid #D9DEE6" }}>{String(this.state.error?.message)}{"\n"}{this.state.stack}</pre>
        <button onClick={() => location.reload()} style={{ marginTop: 12 }}>Reload</button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Crash>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </Crash>
  </React.StrictMode>
);
