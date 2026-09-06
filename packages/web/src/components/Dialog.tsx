import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

/** Promise-based prompt and confirm dialogs, so the app never blocks on window.prompt. */
type Ask = { kind: "prompt" | "confirm"; title: string; label?: string; placeholder?: string; initial?: string; multiline?: boolean; resolve: (v: string | null | boolean) => void };
const useDialog = create<{ current: Ask | null; open(a: Ask): void; close(): void }>((set) => ({
  current: null,
  open: (current) => set({ current }),
  close: () => set({ current: null })
}));

export function ask(title: string, opts: { label?: string; placeholder?: string; initial?: string; multiline?: boolean } = {}): Promise<string | null> {
  return new Promise((resolve) => useDialog.getState().open({ kind: "prompt", title, ...opts, resolve: (v) => resolve(typeof v === "string" ? v : null) }));
}
export function confirm(title: string, label?: string): Promise<boolean> {
  return new Promise((resolve) => useDialog.getState().open({ kind: "confirm", title, label, resolve: (v) => resolve(v === true) }));
}

export function DialogHost() {
  const current = useDialog((s) => s.current);
  const close = useDialog((s) => s.close);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { setValue(current?.initial ?? ""); setTimeout(() => ref.current?.focus(), 0); }, [current]);
  if (!current) return null;
  const done = (v: string | null | boolean) => { current.resolve(v); close(); };
  return (
    <div className="backdrop" onClick={() => done(current.kind === "prompt" ? null : false)}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={current.title}>
        <div className="hdr">{current.title}</div>
        <div className="body" style={{ display: "grid", gap: 10 }}>
          {current.label && <div className="small" style={{ color: "var(--ink-2)", lineHeight: 1.5 }}>{current.label}</div>}
          {current.kind === "prompt" && (current.multiline
            ? <textarea ref={ref} className="input" value={value} placeholder={current.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) done(value); if (e.key === "Escape") done(null); }} />
            : <input ref={ref} className="input" value={value} placeholder={current.placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") done(value); if (e.key === "Escape") done(null); }} />)}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => done(current.kind === "prompt" ? null : false)}>Cancel</button>
            <button className="btn primary" onClick={() => done(current.kind === "prompt" ? value : true)}>{current.kind === "prompt" ? "OK" : "Confirm"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
