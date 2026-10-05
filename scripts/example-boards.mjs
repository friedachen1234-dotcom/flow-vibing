/**
 * Writes each example's board: reference cards (inspirations/*.svg), a variants exploration of one element
 * (variants/<panel>/*.html), and board.json naming the nodes and lines that go on the canvas when the example is loaded.
 *
 *   node scripts/example-boards.mjs
 *
 * The fragments keep the element's data-flow-el and its class, so the screen's states keep working after Apply.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "examples");
const svg = (body, bg = "#0A0B0D") => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" rx="18" fill="${bg}"/>${body}</svg>`;
const f = "font-family=\"system-ui, -apple-system, sans-serif\"";

const boards = {
  baseline: {
    refs: [
      { id: "ref-ring", title: "Recovery ring", caption: "One band, thick stroke, round caps. The figure sits alone in the middle.", file: "recovery-ring.svg", body: svg(`<circle cx="200" cy="150" r="92" fill="none" stroke="#1C1F24" stroke-width="18"/><circle cx="200" cy="150" r="92" fill="none" stroke="#16EC06" stroke-width="18" stroke-linecap="round" stroke-dasharray="578" stroke-dashoffset="185" transform="rotate(-90 200 150)"/><text x="200" y="160" text-anchor="middle" ${f} font-size="54" font-weight="800" fill="#fff">68<tspan font-size="22" dy="-22">%</tspan></text><text x="200" y="192" text-anchor="middle" ${f} font-size="11" letter-spacing="3" fill="#8B9099">RECOVERY</text>`) },
      { id: "ref-type", title: "Type & hierarchy", caption: "Numeral scale and metric styling for key health data.", file: "type-hierarchy.svg", body: svg(`<text x="40" y="110" ${f} font-size="64" font-weight="800" fill="#fff">68<tspan font-size="26" dy="-28">%</tspan></text><text x="40" y="140" ${f} font-size="12" letter-spacing="3" fill="#8B9099">RECOVERY</text><line x1="40" y1="165" x2="360" y2="165" stroke="#24272D"/><text x="40" y="200" ${f} font-size="12" letter-spacing="3" fill="#8B9099">HRV</text><text x="40" y="240" ${f} font-size="34" font-weight="700" fill="#fff">74 <tspan font-size="16" fill="#8B9099">ms</tspan></text><text x="40" y="268" ${f} font-size="14" font-weight="700" fill="#16EC06">+6 vs base</text>`) }
    ],
    panel: { id: "vp-recovery-ring", screenId: "today", elementId: "recovery-ring", direction: "Keep the verdict readable", linkRef: "ref-ring" },
    ring: (stroke, off, extra = "") => `<button class="ring" data-flow-el="recovery-ring" data-flow-transition="today-to-recovery" aria-label="Recovery 68 per cent"${extra}>
  <svg width="208" height="208" viewBox="0 0 208 208">
    <circle cx="104" cy="104" r="92" fill="none" stroke="#1C1F24" stroke-width="${stroke}" />
    <circle class="track-fill" cx="104" cy="104" r="92" fill="none" stroke="#16EC06" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="578" stroke-dashoffset="${off}" />
  </svg>
  <span class="mid"><span class="pct">68<sup>%</sup></span><span class="lbl">Recovery</span></span>
</button>`,
    options: (b) => [
      { id: "full", label: "Full ring", rationale: "Same idea, more weight. Reads from further away.", html: b.ring(22, 185) },
      { id: "arc", label: "Open arc", rationale: "Frees vertical space for the cards underneath.", html: b.ring(16, 330, ' style="transform:rotate(-40deg)"').replace('<span class="mid">', '<span class="mid" style="transform:rotate(40deg)">') },
      { id: "bar", label: "Minimal bar", rationale: "Drops the gauge. The figure and a scale carry it.", html: `<div class="ring" data-flow-el="recovery-ring" data-flow-transition="today-to-recovery" style="width:auto;height:auto;display:grid;gap:10px;padding:8px 0">
  <span style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8B9099">Recovery</span>
  <span class="pct" style="font-size:56px;font-weight:800;letter-spacing:-.045em;line-height:1">68<sup style="font-size:22px;vertical-align:24px">%</sup></span>
  <div style="height:8px;border-radius:999px;background:#1C1F24;overflow:hidden"><i style="display:block;width:68%;height:100%;background:#16EC06;border-radius:999px"></i></div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#5A6069"><span>0</span><span>34</span><span>67</span><span>100</span></div>
</div>` }
    ]
  },

  "lumen-bank": {
    refs: [
      { id: "ref-card", title: "Gradient balance card", caption: "Deep blue gradient, one big numeral, the account details whispered underneath.", file: "balance-card.svg", body: svg(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B4FE4"/><stop offset="1" stop-color="#1F2A8F"/></linearGradient></defs><rect x="40" y="50" width="320" height="200" rx="22" fill="url(#g)"/><circle cx="340" cy="60" r="90" fill="rgba(255,255,255,.08)"/><text x="66" y="96" ${f} font-size="13" fill="rgba(255,255,255,.8)">Everyday account</text><text x="66" y="150" ${f} font-size="44" font-weight="700" fill="#fff">£4,286<tspan font-size="22">.20</tspan></text><text x="66" y="218" ${f} font-size="13" fill="rgba(255,255,255,.85)">Available £4,286.20</text><text x="334" y="218" text-anchor="end" ${f} font-size="13" fill="rgba(255,255,255,.85)">•• 4821</text>`, "#F4F6FB") },
      { id: "ref-flat", title: "Quiet surfaces", caption: "White cards, hairline borders, colour only on the number that matters.", file: "quiet-surfaces.svg", body: svg(`<rect x="40" y="50" width="320" height="92" rx="16" fill="#fff" stroke="#E4E7EC"/><text x="62" y="84" ${f} font-size="12" font-weight="600" fill="#667085">EVERYDAY</text><text x="62" y="122" ${f} font-size="30" font-weight="700" fill="#101828">£4,286.20</text><rect x="40" y="158" width="320" height="92" rx="16" fill="#fff" stroke="#E4E7EC"/><text x="62" y="192" ${f} font-size="12" font-weight="600" fill="#667085">SAVINGS</text><text x="62" y="230" ${f} font-size="30" font-weight="700" fill="#12925E">£12,040.00</text>`, "#F4F6FB") }
    ],
    panel: { id: "vp-balance-card", screenId: "home", elementId: "balance-card", direction: "Calmer, less like a credit card", linkRef: "ref-flat" },
    options: () => [
      { id: "flat", label: "Flat surface", rationale: "Drops the gradient. The amount does the work on a plain card.", html: `<div class="balance" data-flow-el="balance-card" style="background:var(--color-surface,#fff);color:var(--color-ink,#101828);box-shadow:none;border:1px solid var(--color-line,#E4E7EC)">
        <div class="label" style="opacity:1;color:var(--color-muted,#667085)">Everyday account</div>
        <div class="amount"><span class="cur" style="opacity:1;color:var(--color-muted,#667085)">£</span>4,286<span style="font-size:24px;opacity:.6">.20</span></div>
        <div class="skeleton"></div>
        <div class="meta" style="opacity:1;color:var(--color-muted,#667085)"><span>Available <b style="color:var(--color-ink,#101828)">£4,286.20</b></span><span>•• 4821</span></div>
      </div>` },
      { id: "strip", label: "Compact strip", rationale: "One line. Leaves room for contacts and activity above the fold.", html: `<div class="balance" data-flow-el="balance-card" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-radius:14px">
        <div><div class="label">Everyday account</div><div class="meta" style="margin-top:4px;display:block">•• 4821</div></div>
        <div class="amount" style="margin-top:0;font-size:30px"><span class="cur" style="font-size:16px;vertical-align:6px">£</span>4,286<span style="font-size:18px;opacity:.85">.20</span></div>
        <div class="skeleton"></div>
      </div>` },
      { id: "hero", label: "Hero numeral", rationale: "Bigger figure, label above, nothing else competing with it.", html: `<div class="balance" data-flow-el="balance-card" style="padding:28px 22px 24px;text-align:center">
        <div class="label" style="letter-spacing:.08em;text-transform:uppercase;font-size:11px">Everyday account</div>
        <div class="amount" style="font-size:52px;margin-top:10px"><span class="cur" style="font-size:26px;vertical-align:16px">£</span>4,286<span style="font-size:26px;opacity:.85">.20</span></div>
        <div class="skeleton"></div>
        <div class="meta" style="justify-content:center;gap:14px;margin-top:14px"><span>Available <b>£4,286.20</b></span><span>•• 4821</span></div>
      </div>` }
    ]
  },

  "relay-desk": {
    refs: [
      { id: "ref-strip", title: "KPI strip", caption: "Four figures on one hairline row. Trend is a small coloured arrow, never a chart.", file: "kpi-strip.svg", body: svg(`<rect x="30" y="110" width="340" height="80" rx="12" fill="#fff" stroke="#E6E6E3"/>${[["Open","24","#C2410C"],["First resp.","11m","#166534"],["Resolved","148","#166534"],["CSAT","4.7","#6B6B76"]].map(([l,v,c],i)=>`<text x="${52+i*85}" y="138" ${f} font-size="10" font-weight="600" fill="#6B6B76">${l.toUpperCase()}</text><text x="${52+i*85}" y="170" ${f} font-size="24" font-weight="700" fill="#1B1B1F">${v}</text><rect x="${52+i*85+ (v.length>2?48:36)}" y="156" width="14" height="4" rx="2" fill="${c}"/>`).join("")}<line x1="115" y1="122" x2="115" y2="178" stroke="#E6E6E3"/><line x1="200" y1="122" x2="200" y2="178" stroke="#E6E6E3"/><line x1="285" y1="122" x2="285" y2="178" stroke="#E6E6E3"/>`, "#F7F7F5") },
      { id: "ref-spark", title: "Sparkline tiles", caption: "Each number carries its own seven-day shape, in the accent green.", file: "sparkline-tiles.svg", body: svg(`${[0,1].map(i=>`<rect x="${30+i*175}" y="70" width="165" height="160" rx="12" fill="#fff" stroke="#E6E6E3"/><text x="${50+i*175}" y="100" ${f} font-size="11" font-weight="600" fill="#6B6B76">${i?"RESOLVED THIS WEEK":"OPEN TICKETS"}</text><text x="${50+i*175}" y="142" ${f} font-size="34" font-weight="700" fill="#1B1B1F">${i?"148":"24"}</text><polyline fill="none" stroke="#0F766E" stroke-width="2.5" stroke-linejoin="round" points="${[0,1,2,3,4,5,6].map(k=>`${50+i*175+k*23},${i?[200,190,195,180,178,168,160][k]:[170,178,172,190,186,198,204][k]}`).join(" ")}"/>`).join("")}`, "#F7F7F5") }
    ],
    panel: { id: "vp-kpi-row", screenId: "reports", elementId: "kpi-row", direction: "Scannable from across the room", linkRef: "ref-spark" },
    options: () => {
      const spark = (pts, color) => `<svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none" style="display:block;margin-top:10px"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${pts}"/></svg>`;
      return [
        { id: "spark", label: "Tiles with trend", rationale: "Each figure carries its seven-day shape, so the delta needs no reading.", html: `<div class="kpis" data-flow-el="kpi-row">
          <div class="kpi"><div class="l">Open tickets</div><div class="v">24</div><span class="d down">▲ 6 vs last week</span>${spark("0,8 20,12 40,10 60,16 80,14 100,20 120,24", "#C2410C")}</div>
          <div class="kpi"><div class="l">Median first response</div><div class="v">11<small>min</small></div><span class="d up">▼ 4 min faster</span>${spark("0,22 20,18 40,20 60,14 80,12 100,8 120,6", "#0F766E")}</div>
          <div class="kpi"><div class="l">Resolved this week</div><div class="v">148</div><span class="d up">▲ 12%</span>${spark("0,20 20,18 40,19 60,12 80,10 100,6 120,4", "#0F766E")}</div>
          <div class="kpi"><div class="l">CSAT</div><div class="v">4.7<small>/ 5</small></div><span class="d flat">— unchanged</span>${spark("0,12 20,12 40,13 60,12 80,12 100,11 120,12", "#6B6B76")}</div>
        </div>` },
        { id: "strip", label: "Single strip", rationale: "One row, hairline dividers. Gives the chart below the height it wants.", html: `<div class="kpis" data-flow-el="kpi-row" style="display:flex;gap:0;background:var(--color-surface,#fff);border:1px solid var(--color-line,#E6E6E3);border-radius:var(--radius-card,10px)">
          <div class="kpi" style="flex:1;border:0;border-right:1px solid var(--color-line,#E6E6E3);border-radius:0;display:flex;align-items:baseline;gap:10px;padding:14px 18px"><div class="l">Open tickets</div><div class="v" style="margin:0;font-size:24px">24</div><span class="d down" style="margin:0 0 0 auto">▲ 6</span></div>
          <div class="kpi" style="flex:1;border:0;border-right:1px solid var(--color-line,#E6E6E3);border-radius:0;display:flex;align-items:baseline;gap:10px;padding:14px 18px"><div class="l">First response</div><div class="v" style="margin:0;font-size:24px">11<small>min</small></div><span class="d up" style="margin:0 0 0 auto">▼ 4</span></div>
          <div class="kpi" style="flex:1;border:0;border-right:1px solid var(--color-line,#E6E6E3);border-radius:0;display:flex;align-items:baseline;gap:10px;padding:14px 18px"><div class="l">Resolved</div><div class="v" style="margin:0;font-size:24px">148</div><span class="d up" style="margin:0 0 0 auto">▲ 12%</span></div>
          <div class="kpi" style="flex:1;border:0;border-radius:0;display:flex;align-items:baseline;gap:10px;padding:14px 18px"><div class="l">CSAT</div><div class="v" style="margin:0;font-size:24px">4.7<small>/ 5</small></div><span class="d flat" style="margin:0 0 0 auto">—</span></div>
        </div>` },
        { id: "lead", label: "Lead metric", rationale: "Open tickets is the number the room argues about, so it gets twice the space.", html: `<div class="kpis" data-flow-el="kpi-row" style="grid-template-columns:2fr 1fr 1fr 1fr">
          <div class="kpi" style="background:var(--color-accent,#0F766E);border-color:var(--color-accent,#0F766E);color:#fff"><div class="l" style="color:rgba(255,255,255,.8)">Open tickets</div><div class="v" style="font-size:44px">24</div><span class="d" style="background:rgba(255,255,255,.18);color:#fff">▲ 6 vs last week</span></div>
          <div class="kpi"><div class="l">Median first response</div><div class="v">11<small>min</small></div><span class="d up">▼ 4 min faster</span></div>
          <div class="kpi"><div class="l">Resolved this week</div><div class="v">148</div><span class="d up">▲ 12%</span></div>
          <div class="kpi"><div class="l">CSAT</div><div class="v">4.7<small>/ 5</small></div><span class="d flat">— unchanged</span></div>
        </div>` }
      ];
    }
  },

  plated: {
    refs: [
      { id: "ref-type", title: "Counter-distance type", caption: "Serif at 40px or more, generous leading. Readable with floury hands and a step back.", file: "counter-type.svg", body: svg(`<text x="40" y="90" font-family="Georgia, serif" font-size="30" fill="#1F1A17">Halve the lemons,</text><text x="40" y="132" font-family="Georgia, serif" font-size="30" fill="#1F1A17">squeeze one over the</text><text x="40" y="174" font-family="Georgia, serif" font-size="30" fill="#1F1A17">tray, tuck the halves</text><text x="40" y="216" font-family="Georgia, serif" font-size="30" fill="#1F1A17">between the chicken.</text><rect x="40" y="242" width="96" height="30" rx="15" fill="#F7F1E6"/><text x="88" y="262" text-anchor="middle" ${f} font-size="13" font-weight="600" fill="#1F1A17">2 lemons</text>`, "#FFFDF8") },
      { id: "ref-timer", title: "Timer as the hero", caption: "When a step has a time, the time is the biggest thing on the screen.", file: "timer-hero.svg", body: svg(`<rect x="40" y="50" width="320" height="200" rx="26" fill="#fff" stroke="#EDE6DD"/><text x="66" y="90" ${f} font-size="12" font-weight="700" letter-spacing="2" fill="#D9480F">STEP 4 · ROAST</text><text x="66" y="178" ${f} font-size="72" font-weight="700" fill="#1F1A17">38:00</text><rect x="66" y="200" width="120" height="30" rx="15" fill="#D9480F"/><text x="126" y="220" text-anchor="middle" ${f} font-size="13" font-weight="700" fill="#fff">Start timer</text>`, "#FFFDF8") }
    ],
    panel: { id: "vp-step-card", screenId: "cook", elementId: "step-card", direction: "Readable from across the kitchen", linkRef: "ref-type" },
    options: () => [
      { id: "bigger", label: "Bigger type", rationale: "Same card, 44px serif. One glance from the hob is enough.", html: `<div class="step" data-flow-el="step-card" style="padding:40px 44px">
        <div class="n">Step 3</div>
        <p style="font-size:44px;line-height:1.25">Halve the lemons, squeeze one over the tray, and tuck all four halves cut side down between the chicken.</p>
        <div class="ings" style="margin-top:28px"><span style="font-size:17px">2 lemons</span><span style="font-size:17px">Chicken, skin side up</span></div>
      </div>` },
      { id: "rail", label: "Numbered rail", rationale: "The step number becomes a big numeral on the left, so progress is visible without the bar.", html: `<div class="step" data-flow-el="step-card" style="display:grid;grid-template-columns:96px 1fr;gap:28px;align-items:start">
        <div class="n" style="font-size:88px;line-height:1;letter-spacing:-.04em;text-transform:none;font-family:var(--font-display,Georgia,serif);font-weight:400">3</div>
        <div><p style="margin-top:4px">Halve the lemons, squeeze one over the tray, and tuck all four halves cut side down between the chicken.</p>
        <div class="ings"><span>2 lemons</span><span>Chicken, skin side up</span></div></div>
      </div>` },
      { id: "timer", label: "Timer-forward", rationale: "Puts the time inside the card, where the eye already is, instead of in the toolbar.", html: `<div class="step" data-flow-el="step-card">
        <div style="display:flex;justify-content:space-between;align-items:center"><div class="n">Step 3</div><span style="font-size:15px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--color-muted,#7A6F68)">No timer</span></div>
        <p>Halve the lemons, squeeze one over the tray, and tuck all four halves cut side down between the chicken.</p>
        <div style="display:flex;align-items:center;gap:14px;margin-top:24px;padding-top:20px;border-top:1px solid var(--color-line,#EDE6DD)"><span style="font-size:44px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums">00:00</span><span style="font-size:15px;color:var(--color-muted,#7A6F68)">Next step roasts for 38 min</span></div>
        <div class="ings" style="margin-top:18px"><span>2 lemons</span><span>Chicken, skin side up</span></div>
      </div>` }
    ]
  }
};

for (const [id, b] of Object.entries(boards)) {
  const dir = path.join(root, id);
  mkdirSync(path.join(dir, "inspirations"), { recursive: true });
  mkdirSync(path.join(dir, "variants", b.panel.id), { recursive: true });
  const nodes = [];
  const edges = [];
  // References stand left of the first screen, under the brief and the note the loader adds.
  b.refs.forEach((r, i) => {
    writeFileSync(path.join(dir, "inspirations", r.file), r.body);
    nodes.push({ id: r.id, type: "inspiration", kind: "image", title: r.title, caption: r.caption, description: "", path: `inspirations/${r.file}`, position: { x: -420, y: 400 + i * 300 }, width: 224 });
  });
  const options = b.options(b).map((o) => {
    writeFileSync(path.join(dir, "variants", b.panel.id, `${o.id}.html`), o.html + "\n");
    return { id: o.id, label: o.label, rationale: o.rationale, file: `variants/${b.panel.id}/${o.id}.html` };
  });
  // The exploration sits under its screen. Screens land at x = n * (width + 140) when the example is loaded.
  const spec = JSON.parse(readFileSync(path.join(dir, "flow.json"), "utf8"));
  const n = spec.screens.findIndex((s) => s.id === b.panel.screenId);
  const panelW = 16 + options.length * 220;
  nodes.push({ id: b.panel.id, type: "variantPanel", target: { screenId: b.panel.screenId, elementId: b.panel.elementId }, direction: b.panel.direction, options, position: { x: n * (spec.device.width + 140) + (spec.device.width - panelW) / 2, y: spec.device.height + 120 } });
  edges.push({ id: `magic-${b.panel.linkRef}`, type: "magic", source: b.panel.linkRef, target: `screen:${b.panel.screenId}`, targetElementId: b.panel.elementId, relation: "match-style", note: "" });
  edges.push({ id: `link-${b.panel.id}`, type: "variantLink", source: `screen:${b.panel.screenId}`, target: b.panel.id, targetElementId: b.panel.elementId, note: "" });
  writeFileSync(path.join(dir, "board.json"), JSON.stringify({ nodes, edges }, null, 2) + "\n");
  console.log(`${id}: ${b.refs.length} references, ${options.length} variants of ${b.panel.screenId}/${b.panel.elementId}`);
}
