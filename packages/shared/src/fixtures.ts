import { DEVICE_PRESETS, type DesignSpec } from "./spec.js";

/** A small three-screen spec used by tests and the demo project. */
export function demoSpec(id = "demo-coffee"): DesignSpec {
  return {
    version: 1,
    id,
    name: "Corner Coffee",
    brief: "A mobile ordering app for a small coffee shop. Customers browse the menu, customise a drink, and pay. Keep it warm and quick.",
    device: DEVICE_PRESETS.mobile,
    tokens: {
      colors: { bg: "#FBF7F2", ink: "#2A211C", accent: "#B4502A", muted: "#8C7B72", surface: "#FFFFFF" },
      type: { body: "'Source Sans 3', system-ui, sans-serif", display: "'Fraunces', Georgia, serif" },
      spacing: { unit: "8px" },
      radius: { card: "14px", pill: "999px" },
      motion: { fast: "160ms", base: "240ms" }
    },
    components: [
      { id: "primary-button", name: "Primary button", description: "Full-width pill, accent fill", usedIn: ["menu", "customise", "checkout"] }
    ],
    screens: [
      {
        id: "menu",
        name: "Menu",
        purpose: "Browse drinks and pick one to customise",
        file: "screens/menu.html",
        states: [
          { id: "default", name: "Default", description: "Menu loaded", isDefault: true },
          { id: "loading", name: "Loading", description: "Menu request in flight", trigger: "app opened", isDefault: false },
          { id: "empty", name: "Sold out", description: "Every drink unavailable", trigger: "no items available", isDefault: false }
        ],
        elements: [
          { id: "drink-card", role: "card", label: "Drink card" },
          { id: "cart-button", role: "button", label: "Cart button" }
        ],
        provenance: []
      },
      {
        id: "customise",
        name: "Customise",
        purpose: "Choose size, milk, and extras for one drink",
        file: "screens/customise.html",
        states: [
          { id: "default", name: "Default", description: "", isDefault: true },
          { id: "invalid", name: "Invalid", description: "A required option is missing", trigger: "tap Add without a size", isDefault: false }
        ],
        elements: [
          { id: "size-picker", role: "segmented", label: "Size picker" },
          { id: "add-button", role: "button", label: "Add to order" },
          { id: "back-button", role: "button", label: "Back" }
        ],
        provenance: []
      },
      {
        id: "checkout",
        name: "Checkout",
        purpose: "Review the order and pay",
        file: "screens/checkout.html",
        states: [
          { id: "default", name: "Default", description: "", isDefault: true },
          { id: "paying", name: "Paying", description: "Payment in flight", trigger: "tap Pay", isDefault: false },
          { id: "failed", name: "Payment failed", description: "Card declined", trigger: "payment error", isDefault: false },
          { id: "done", name: "Order placed", description: "Confirmation with pickup time", trigger: "payment success", isDefault: false }
        ],
        elements: [
          { id: "pay-button", role: "button", label: "Pay" },
          { id: "back-button", role: "button", label: "Back" }
        ],
        provenance: []
      }
    ],
    transitions: [
      { id: "menu-to-customise", from: { screenId: "menu", elementId: "drink-card" }, to: { screenId: "customise" }, trigger: "tap a drink", animation: "push" },
      { id: "menu-to-checkout", from: { screenId: "menu", elementId: "cart-button" }, to: { screenId: "checkout" }, trigger: "tap cart", condition: "cart has items", animation: "modal" },
      { id: "customise-back", from: { screenId: "customise", elementId: "back-button" }, to: { screenId: "menu" }, trigger: "tap back", animation: "pop" },
      { id: "customise-to-checkout", from: { screenId: "customise", elementId: "add-button" }, to: { screenId: "checkout" }, trigger: "tap Add to order", condition: "size chosen", animation: "push" },
      { id: "customise-invalid", from: { screenId: "customise", elementId: "add-button" }, to: { screenId: "customise", stateId: "invalid" }, trigger: "tap Add to order", condition: "no size chosen", animation: "none" },
      { id: "checkout-back", from: { screenId: "checkout", elementId: "back-button" }, to: { screenId: "menu" }, trigger: "tap back", animation: "pop" },
      { id: "checkout-pay", from: { screenId: "checkout", elementId: "pay-button" }, to: { screenId: "checkout", stateId: "done" }, trigger: "tap Pay", condition: "payment succeeds", animation: "fade" }
    ],
    edgeCases: [
      { id: "offline-menu", attachedTo: { screenId: "menu" }, scenario: "Device is offline when the menu loads", handling: "Show cached menu with a banner; disable ordering", severity: "high" },
      { id: "sold-out-item", attachedTo: { transitionId: "menu-to-customise" }, scenario: "Drink sells out between browse and tap", handling: "Show a toast and keep the user on the menu", severity: "medium" },
      { id: "card-declined", attachedTo: { screenId: "checkout" }, scenario: "Card is declined", handling: "Enter the failed state, keep the order, offer another method", severity: "high" }
    ]
  };
}

/** Minimal screen HTML that obeys the runtime contract. Used by the demo project. */
export function demoScreenHtml(spec: DesignSpec, screenId: string): string {
  const screen = spec.screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`no screen ${screenId}`);
  const outgoing = spec.transitions.filter((t) => t.from.screenId === screenId);
  const c = spec.tokens.colors;
  const els = screen.elements
    .map((el) => {
      const t = outgoing.find((x) => x.from.elementId === el.id);
      const attr = t ? ` data-flow-transition="${t.id}"` : "";
      const tag = el.role === "button" ? "button" : "div";
      return `      <${tag} class="el ${el.role}" data-flow-el="${el.id}"${attr}>${el.label}${t ? ` → ${spec.screens.find((s) => s.id === t.to.screenId)?.name ?? t.to.screenId}` : ""}</${tag}>`;
    })
    .join("\n");
  const stateCss = screen.states
    .filter((s) => !s.isDefault)
    .map((s) => `      html[data-flow-state="${s.id}"] .state-badge::after { content: "${s.name}"; }`)
    .join("\n");
  return `<!doctype html>
<html lang="en" data-flow-screen="${screen.id}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${screen.name}</title>
    <link rel="stylesheet" href="../tokens.css" />
    <style>
      body { margin: 0; font-family: var(--font-body, system-ui); background: var(--color-bg, ${c.bg ?? "#fff"}); color: var(--color-ink, ${c.ink ?? "#111"}); min-height: 100vh; }
      header { padding: 20px 20px 8px; font-family: var(--font-display, serif); font-size: 28px; }
      .purpose { padding: 0 20px 20px; color: var(--color-muted, #777); font-size: 14px; }
      main { display: grid; gap: 12px; padding: 0 20px; }
      .el { background: var(--color-surface, #fff); border-radius: var(--radius-card, 12px); padding: 18px; border: 1px solid rgba(0,0,0,.06); font: inherit; text-align: left; }
      .button { background: var(--color-accent, #333); color: #fff; border: none; cursor: pointer; }
      .state-badge { position: fixed; bottom: 16px; left: 20px; font-size: 12px; color: var(--color-muted, #777); }
      .state-badge::after { content: "Default"; }
${stateCss}
    </style>
  </head>
  <body>
    <header>${screen.name}</header>
    <div class="purpose">${screen.purpose}</div>
    <main>
${els}
    </main>
    <div class="state-badge">State: </div>
  </body>
</html>
`;
}

export function tokensCss(spec: DesignSpec): string {
  const lines: string[] = [":root {"];
  for (const [k, v] of Object.entries(spec.tokens.colors)) lines.push(`  --color-${k}: ${v};`);
  for (const [k, v] of Object.entries(spec.tokens.type)) lines.push(`  --font-${k}: ${v};`);
  for (const [k, v] of Object.entries(spec.tokens.spacing)) lines.push(`  --space-${k}: ${v};`);
  for (const [k, v] of Object.entries(spec.tokens.radius)) lines.push(`  --radius-${k}: ${v};`);
  for (const [k, v] of Object.entries(spec.tokens.motion)) lines.push(`  --motion-${k}: ${v};`);
  lines.push("}");
  return lines.join("\n") + "\n";
}
