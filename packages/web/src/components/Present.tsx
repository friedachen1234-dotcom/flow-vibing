import { useEffect, useMemo, useRef, useState } from "react";
import { classifyTransition, mainMoves, type DesignSpec, type TransitionSpec } from "@flow/shared";
import { api } from "../api";
import { useFlow } from "../store";
import { Icon } from "./Icon";

type Step = { screenId: string; stateId?: string; via?: TransitionSpec };

/** The main path as an ordered list of steps: start at the first screen, follow each screen's main move until it loops or ends. */
function buildSteps(spec: DesignSpec, overrides: Record<string, string>): Step[] {
  const mains = mainMoves(spec, overrides);
  const steps: Step[] = [];
  const seen = new Set<string>();
  let cur = spec.screens[0]?.id;
  let via: TransitionSpec | undefined;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    steps.push({ screenId: cur, stateId: via?.to.stateId, via });
    const next = mains.get(cur);
    const t = next ? spec.transitions.find((x) => x.id === next) : undefined;
    if (!t) break;
    via = t;
    cur = t.to.screenId;
  }
  // Screens the main path never reaches still get a step at the end, so nothing is hidden.
  for (const s of spec.screens) if (!seen.has(s.id)) steps.push({ screenId: s.id });
  return steps;
}

/** Immersive walkthrough: the prototype at full size with the flow's steps beside it. */
export function Present() {
  const bundle = useFlow((s) => s.bundle)!;
  const projectId = useFlow((s) => s.projectId)!;
  const setWalk = useFlow((s) => s.setWalk);
  const { spec, canvas } = bundle;
  const steps = useMemo(() => buildSteps(spec, canvas.primaryMoves), [spec, canvas.primaryMoves]);
  const [i, setI] = useState(0);
  const [live, setLive] = useState<{ screenId: string; stateId: string | null } | null>(null);
  const ref = useRef<HTMLIFrameElement>(null);
  const step = steps[i];
  const screen = spec.screens.find((s) => s.id === step?.screenId);
  const post = (msg: Record<string, unknown>) => ref.current?.contentWindow?.postMessage({ source: "flow-host", ...msg }, "*");
  const close = () => setWalk({ active: false, screenId: null, stateId: null, lastTransitionId: null });

  const go = (n: number, anim: "push" | "pop" | "none" = "push") => {
    const k = Math.max(0, Math.min(steps.length - 1, n));
    const s = steps[k];
    setI(k);
    post({ type: "flow:goto", screenId: s.screenId, stateId: s.stateId ?? null, animation: anim });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(i + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1, "pop"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, steps.length]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (!ref.current || ev.source !== ref.current.contentWindow) return;
      const d = ev.data;
      if (d?.source !== "flow-shell" || d.type !== "flow:navigated") return;
      setLive({ screenId: d.screenId, stateId: d.stateId });
      const k = steps.findIndex((s) => s.screenId === d.screenId);
      if (k >= 0) setI(k);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [steps]);

  if (!screen) return null;
  const shown = live ? spec.screens.find((s) => s.id === live.screenId) ?? screen : screen;
  const branches = spec.transitions.filter((t) => t.from.screenId === shown.id && classifyTransition(t) === "forward" && t.id !== mainMoves(spec, canvas.primaryMoves).get(shown.id));
  const ecs = spec.edgeCases.filter((e) => e.attachedTo.screenId === shown.id || spec.transitions.some((t) => t.id === e.attachedTo.transitionId && t.from.screenId === shown.id));
  const scale = Math.min(1, (window.innerHeight - 160) / spec.device.height);
  const nameOf = (id: string) => spec.screens.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="present" role="dialog" aria-label="Walkthrough">
      <div className="pr-top">
        <div className="pr-title"><Icon name="play" size={14} /> {spec.name} <span className="muted">· walkthrough</span></div>
        <div className="pr-count">Step {i + 1} of {steps.length}</div>
        <button className="btn ghost light" onClick={close}><Icon name="x" size={14} /> Exit <span className="kbd">esc</span></button>
      </div>
      <div className="pr-body">
        <aside className="pr-steps">
          {steps.map((s, k) => {
            const sc = spec.screens.find((x) => x.id === s.screenId);
            return (
              <button key={s.screenId + k} className={`pr-step ${k === i ? "on" : ""} ${k < i ? "done" : ""}`} onClick={() => go(k, k < i ? "pop" : "push")}>
                <span className="pr-n">{k + 1}</span>
                <span className="pr-body-text">
                  <span className="pr-name">{sc?.name ?? s.screenId}{s.stateId ? <span className="muted"> · {s.stateId}</span> : null}</span>
                  {s.via && <span className="pr-via">{s.via.trigger}{s.via.condition ? ` · if ${s.via.condition}` : ""}</span>}
                </span>
              </button>
            );
          })}
        </aside>
        <div className="pr-stage">
          <div className="pr-device" style={{ width: spec.device.width * scale, height: spec.device.height * scale }}>
            <iframe ref={ref} title={screen.name} src={api.shellUrl(projectId, steps[0].screenId, { state: steps[0].stateId })} style={{ width: spec.device.width, height: spec.device.height, transform: `scale(${scale})`, transformOrigin: "0 0" }} />
          </div>
          <div className="pr-nav">
            <button className="btn light" onClick={() => go(i - 1, "pop")} disabled={i === 0}><Icon name="arrow-left" size={14} /> Back</button>
            <button className="btn primary" onClick={() => go(i + 1)} disabled={i >= steps.length - 1}>Next <Icon name="chevron-right" size={14} /></button>
          </div>
        </div>
        <aside className="pr-detail">
          <div className="pr-screen">{shown.name}</div>
          <p className="pr-purpose">{shown.purpose}</p>
          {shown.states.length > 1 && (
            <div className="pr-sec">
              <h5>States</h5>
              <div className="pr-chips">{shown.states.map((st) => <button key={st.id} className={`chip ${(live?.stateId ?? shown.states.find((x) => x.isDefault)?.id) === st.id ? "on" : ""}`} onClick={() => post({ type: "flow:setState", stateId: st.id })}>{st.name}</button>)}</div>
            </div>
          )}
          {branches.length > 0 && (
            <div className="pr-sec">
              <h5>Branches from here</h5>
              {branches.map((t) => <button key={t.id} className="pr-branch" onClick={() => post({ type: "flow:transition", transitionId: t.id })}><span>{t.trigger}</span><span className="muted">→ {nameOf(t.to.screenId)}{t.condition ? ` · if ${t.condition}` : ""}</span></button>)}
            </div>
          )}
          {ecs.length > 0 && (
            <div className="pr-sec">
              <h5>Edge cases</h5>
              {ecs.map((e) => <div key={e.id} className="pr-ec"><span className={`sev ${e.severity}`} /><div><b>{e.scenario}</b><div className="muted">{e.handling}</div></div></div>)}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
