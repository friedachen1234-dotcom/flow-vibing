/**
 * Headless end-to-end check: create a project, run "generate" over the websocket, print events.
 * Usage: node scripts/run-agent.mjs [apiPort] [name] [brief]
 */
// Uses the WebSocket global built into Node 22.
const port = process.argv[2] || "5191";
const name = process.argv[3] || "Trail Notes";
// Optional: --intent regenerate --payload '{"changeRequests":[...]}'
const intentIdx = process.argv.indexOf("--intent");
const intent = intentIdx > 0 ? process.argv[intentIdx + 1] : "generate";
const payloadIdx = process.argv.indexOf("--payload");
const extraPayload = payloadIdx > 0 ? JSON.parse(process.argv[payloadIdx + 1]) : {};
const brief = process.argv[4] || "A mobile app for hikers to log a walk: pick a trail, start a timer, add a photo note along the way, and finish with a summary they can share. Calm, outdoorsy, quick to use with one hand.";
const base = `http://localhost:${port}`;
let bundle;
if (name.startsWith("id:")) {
  bundle = await (await fetch(`${base}/api/projects/${name.slice(3)}`)).json();
} else {
  const res = await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, brief, deviceKind: "mobile" }) });
  bundle = await res.json();
}
console.log("project", bundle.meta.id);
const ws = new WebSocket(`ws://localhost:${port}/ws`);
ws.onopen = () => ws.send(JSON.stringify({ type: "agent:run", projectId: bundle.meta.id, intent, payload: intent === "generate" ? { brief: bundle.spec?.brief || brief } : extraPayload }));
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data));
  const t = new Date().toISOString().slice(11, 19);
  if (m.type === "agent:text") process.stdout.write(m.delta);
  else if (m.type === "agent:tool") console.log(`\n[${t}] tool ${m.name}: ${m.summary}`);
  else if (m.type === "agent:tool-result") console.log(`[${t}] result ${m.ok ? "ok" : "ERR"}: ${m.summary.slice(0, 100)}`);
  else if (m.type === "agent:message") console.log(`\n[${t}] message: ${m.text.slice(0, 400)}`);
  else if (m.type === "agent:done") { console.log(`\n[${t}] DONE ok=${m.ok} cost=$${m.costUsd.toFixed(3)} turns=${m.numTurns} ms=${m.durationMs} version=${m.versionId}`); for (const i of m.issues) console.log(`  ${i.level}: ${i.message}`); ws.close(); process.exit(0); }
  else if (m.type === "agent:error") { console.log(`\n[${t}] ERROR ${m.message}`); ws.close(); process.exit(1); }
  else console.log(`[${t}] ${m.type} ${JSON.stringify(m).slice(0, 200)}`);
};
ws.onerror = (e) => { console.error("ws error", e.message ?? e); process.exit(1); };
ws.onclose = () => { console.error("\nws closed by server (did it restart?)"); process.exit(2); };
