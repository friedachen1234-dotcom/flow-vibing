/**
 * Prompt compiler. Every request to Claude is assembled here from the graph, never typed into a template elsewhere.
 * Output: a system prompt (the contract), a user prompt (the intent), the files that must stay untouched,
 * and the screens that may be rewritten.
 */
import { z } from "zod";
import {
  ClaudeSpecOutput, MAGIC_RELATION_LABELS, affectedScreens, describeChange,
  type AgentIntent, type CanvasDoc, type CanvasEdge, type CanvasNode, type ChangeRequest, type DesignSpec, type VariantTarget
} from "@flow/shared";

export type CompiledRequest = {
  intent: AgentIntent;
  systemPrompt: string;
  prompt: string;
  plan: string;
  keepFiles: string[];
  affectedScreens: string[];
  contextSources: { nodeId: string; relation: string; targetId?: string }[];
  variantPanelId?: string;
};

const specSchema = JSON.stringify(z.toJSONSchema(ClaudeSpecOutput), null, 1);

export function systemContract(spec: DesignSpec): string {
  const { width, height, kind } = spec.device;
  return `You are the design engine inside FLOW, a canvas-based prototyping tool. You produce working HTML prototypes AND the structured flow behind them, so a designer can switch between a running prototype and a flow chart of screens, states, transitions, and edge cases.

The current working directory is the project folder. You may only read and write files inside it.

PROJECT LAYOUT
- flow.json      the Design Spec (schema below). You write this. It is the source of truth for the flow view.
- tokens.css     shared design tokens as CSS custom properties. Every screen links it.
- screens/*.html one standalone HTML document per screen.
- inspirations/  reference images and text the designer dropped on the canvas. Read them when asked.
- skills/        markdown instructions the designer attached. Follow them for the targets they are attached to.
- variants/      alternative treatments, when asked for variants.

DEVICE
- ${kind}, ${width} x ${height} CSS pixels. Design every screen for exactly this viewport. Screens may scroll vertically.

SCREEN HTML CONTRACT (mandatory, the runtime depends on it)
1. A complete document: <!doctype html>, <html lang="en" data-flow-screen="<screen-id>">, <head>, <body>.
2. <link rel="stylesheet" href="../tokens.css"> in <head>. Use the custom properties from tokens.css for colour, type, spacing, radius, motion. Put screen-specific CSS in a <style> block.
3. Every element that a person can act on to move somewhere or change state carries BOTH:
     data-flow-el="<element-id>"            (must match an element id in flow.json for this screen)
     data-flow-transition="<transition-id>" (must match a transition in flow.json whose from.screenId is this screen and from.elementId is this element)
   The runtime intercepts clicks on data-flow-transition and performs the navigation. Never use <a href> or location changes to move between screens.
   Branches: when one element leads to different places depending on a condition, list EVERY branch id in the same attribute, space separated, e.g. data-flow-transition="pay-success pay-declined". The screen's own script may narrow the attribute to one id when it knows the local state (a size was chosen); if several remain at click time the runtime asks the person which branch to take, showing each transition's condition.
4. Other important regions (hero, list, card, form, nav, footer, empty message, error banner) also get data-flow-el with a stable id so the designer can select them for variants. Aim for 5 to 12 data-flow-el per screen.
5. States: the runtime sets data-flow-state="<state-id>" on <html>. Style non-default states with selectors like
     html[data-flow-state="loading"] .list { ... }
     html[data-flow-state="error"] .error-banner { display: block; }
   The default state must render correctly with NO attribute present. Every state listed in flow.json for the screen must be visibly different.
6. No external network: no CDN scripts, no remote fonts, no remote images. Use inline SVG, CSS gradients, and system or generic font stacks. Inline <script> is allowed for local interactivity (tabs, toggles, form validation) but must not navigate.
7. Real content, never lorem ipsum. Write copy a real product would ship.
8. Accessible by default: semantic elements, labels on inputs, visible focus, sufficient contrast.

DESIGN SPEC CONTRACT (flow.json)
- Write the whole file as JSON matching this schema (the server adds version and id):
${specSchema}
- All ids are kebab-case and stable across regenerations. Reuse existing ids when you change a screen.
- Every screen has at least one state with isDefault true. Add loading, empty, error, and success states where they are real.
- Every transition's from.elementId must be listed in that screen's elements, and the screen HTML must carry the matching data-flow-el and data-flow-transition attributes.
- Transitions with a condition are branches. When one element leads to different places depending on a condition, write one transition per branch with the same from.elementId and distinct conditions.
- Edge cases are required. Think like a careful product designer: offline, empty, invalid input, permission denied, slow response, item gone, session expired, back navigation. Attach each to the screen or transition where it bites, and say how the design handles it. A spec with no edge cases is rejected.
- Keep a components list for reusable pieces (primary button, card, nav bar) and where they are used.

PROCESS
- Read tokens.css, flow.json, and any screen you are asked to keep or change before writing. Do not modify files marked KEEP.
- Write files with the Write tool. Do not run shell commands.
- When done, reply with a short plain-language summary: which screens you wrote or changed, notable states and edge cases, and anything you chose not to do. No code in the summary.`;
}

type Ctx = { spec: DesignSpec; canvas: CanvasDoc };

function nodeById(canvas: CanvasDoc, id: string): CanvasNode | undefined {
  return canvas.nodes.find((n) => n.id === id);
}

function targetLabel(ctx: Ctx, edge: CanvasEdge): string {
  const t = nodeById(ctx.canvas, edge.target);
  if (!t) return edge.target;
  if (t.type === "screen") {
    const s = ctx.spec.screens.find((x) => x.id === t.screenId);
    const el = edge.targetElementId ? ` (element "${edge.targetElementId}")` : "";
    return `screen "${s?.name ?? t.screenId}" [${t.screenId}]${el}`;
  }
  if (t.type === "prompt" && t.kind === "brief") return "the whole project";
  if (t.type === "group") return `group "${t.title}"`;
  if (t.type === "variantPanel") return "this variant request";
  return `${t.type} ${t.id}`;
}

/** Compiles magic lines into context blocks, ordered by target so Claude sees each reference next to what it affects. */
export function contextBlocks(ctx: Ctx, filterTargets?: (edge: CanvasEdge) => boolean): { text: string; sources: CompiledRequest["contextSources"] } {
  const edges = ctx.canvas.edges.filter((e) => e.type === "magic" && (!filterTargets || filterTargets(e)));
  if (edges.length === 0) return { text: "", sources: [] };
  const groupsOf = (nodeId: string) => ctx.canvas.nodes.filter((n) => n.type === "group" && n.id === nodeId);
  const expanded: { edge: CanvasEdge; source: CanvasNode }[] = [];
  for (const e of edges) {
    const src = nodeById(ctx.canvas, e.source);
    if (!src) continue;
    if (src.type === "group") {
      for (const member of ctx.canvas.nodes) {
        if ((member.type === "inspiration" || member.type === "skill") && member.groupId === src.id) expanded.push({ edge: e, source: member });
      }
      void groupsOf;
    } else expanded.push({ edge: e, source: src });
  }
  const byTarget = new Map<string, typeof expanded>();
  for (const item of expanded) {
    const key = targetLabel(ctx, item.edge);
    byTarget.set(key, [...(byTarget.get(key) ?? []), item]);
  }
  const lines: string[] = ["REFERENCES AND INSTRUCTIONS FROM THE CANVAS", "The designer connected these to specific targets. Honour each relation for its target only."];
  const sources: CompiledRequest["contextSources"] = [];
  for (const [target, items] of byTarget) {
    lines.push("", `Target: ${target}`);
    for (const { edge, source } of items) {
      const rel = edge.relation ?? "free-text";
      const relText = rel === "free-text" ? edge.note || "see note" : `${MAGIC_RELATION_LABELS[rel].label}: ${MAGIC_RELATION_LABELS[rel].hint}${edge.note ? `. Note: ${edge.note}` : ""}`;
      const targetNode = nodeById(ctx.canvas, edge.target);
      sources.push({ nodeId: source.id, relation: rel, targetId: targetNode?.type === "screen" ? targetNode.screenId : undefined });
      if (source.type === "inspiration") {
        if (source.kind === "image" && source.path) lines.push(`- Image reference "${source.title}" at ${source.path}. Read this file with the Read tool to see it.${source.caption ? ` Caption: ${source.caption}` : ""}${source.description ? ` Description: ${source.description}` : ""}\n  Relation: ${relText}`);
        else if (source.kind === "text") lines.push(`- Text reference "${source.title}": ${source.text ?? ""}\n  Relation: ${relText}`);
        else if (source.kind === "url") lines.push(`- Web reference "${source.title}" (${source.url ?? ""})${source.path ? ` with capture at ${source.path}, read it` : ""}.${source.description ? ` ${source.description}` : ""}\n  Relation: ${relText}`);
        else if (source.kind === "style") lines.push(`- Style sample "${source.title}": ${source.text ?? ""}\n  Relation: ${relText}`);
      } else if (source.type === "skill") {
        lines.push(`- Skill "${source.title}" at ${source.path}. Read this markdown file and follow it for the target.\n  Relation: ${relText}`);
      } else if (source.type === "note") {
        lines.push(`- Note: ${source.text}\n  Relation: ${relText}`);
      } else if (source.type === "versionPin") {
        lines.push(`- Earlier version "${source.label}" (git ${source.versionId.slice(0, 8)}). Its files can be viewed with: git show ${source.versionId}:<path>. Prefer describing what to borrow rather than restoring it.\n  Relation: ${relText}`);
      }
    }
  }
  return { text: lines.join("\n"), sources };
}

function specSummary(spec: DesignSpec): string {
  if (spec.screens.length === 0) return "There are no screens yet.";
  const lines = [`Current flow (${spec.screens.length} screens):`];
  for (const s of spec.screens) {
    const states = s.states.map((st) => st.id + (st.isDefault ? "*" : "")).join(", ");
    const outs = spec.transitions.filter((t) => t.from.screenId === s.id).map((t) => `${t.from.elementId ?? "?"} → ${t.to.screenId}${t.to.stateId ? "#" + t.to.stateId : ""}${t.condition ? ` if ${t.condition}` : ""}`);
    lines.push(`- ${s.id} "${s.name}" (${s.file}) states: ${states || "none"}; transitions: ${outs.join("; ") || "none"}`);
  }
  if (spec.edgeCases.length) lines.push(`Edge cases: ${spec.edgeCases.map((e) => `${e.id} on ${e.attachedTo.screenId ?? e.attachedTo.transitionId}`).join(", ")}`);
  return lines.join("\n");
}

export function compileGenerate(ctx: Ctx, brief: string): CompiledRequest {
  const { text: refs, sources } = contextBlocks(ctx);
  const prompt = `Design and build the first version of this prototype.

BRIEF
${brief}

${refs ? refs + "\n\n" : ""}WHAT TO PRODUCE
1. Decide the screens. Usually 3 to 7. Each screen has a clear purpose. Name them the way a product team would.
2. Decide the states for each screen and the transitions between screens, including branches with conditions.
3. List the edge cases and how each is handled.
4. Write tokens.css first, then every screen file under screens/, then flow.json last so it reflects exactly what you wrote.
5. Reply with the plain-language summary.`;
  return {
    intent: "generate",
    systemPrompt: systemContract(ctx.spec),
    prompt,
    plan: `Generate the first version from the brief. Claude will design the screens, states, transitions, and edge cases, then write tokens.css, one HTML file per screen, and flow.json.${sources.length ? ` ${sources.length} reference${sources.length === 1 ? "" : "s"} from the canvas will be included.` : ""}`,
    keepFiles: [],
    affectedScreens: [],
    contextSources: sources
  };
}

export function compileRegenerate(ctx: Ctx, changes: ChangeRequest[]): CompiledRequest {
  const affected = new Set<string>();
  const described: string[] = [];
  for (const cr of changes) {
    for (const s of affectedScreens(cr, ctx.spec)) affected.add(s);
    described.push(`- ${describeChange(cr, ctx.spec)}\n  ${JSON.stringify(cr)}`);
  }
  const keep = ctx.spec.screens.filter((s) => !affected.has(s.id)).map((s) => s.file);
  const affectedList = [...affected];
  const { text: refs, sources } = contextBlocks(ctx, (e) => {
    const t = nodeById(ctx.canvas, e.target);
    if (!t) return false;
    if (t.type === "screen") return affected.has(t.screenId);
    return t.type === "prompt" || t.type === "group";
  });
  const prompt = `Apply these changes to the prototype.

${specSummary(ctx.spec)}

CHANGES REQUESTED (structured; the JSON is the exact edit to the spec)
${described.join("\n")}

SCOPE
- Screens you may rewrite: ${affectedList.length ? affectedList.join(", ") : "none by default; only touch what the changes require"}.
- KEEP untouched (do not open for writing): ${keep.length ? keep.join(", ") : "nothing"}.
- New screens named in the changes get new files under screens/.
- Update flow.json to reflect every change. Keep every id that still exists.

${refs ? refs + "\n\n" : ""}Read flow.json and the affected screen files first. Then write the affected screens, then flow.json. Finish with the plain-language summary.`;
  return {
    intent: "regenerate",
    systemPrompt: systemContract(ctx.spec),
    prompt,
    plan: `Apply ${changes.length} change${changes.length === 1 ? "" : "s"}. Screens to rewrite: ${affectedList.length ? affectedList.join(", ") : "only what the changes require"}. ${keep.length} screen file${keep.length === 1 ? "" : "s"} will be kept as is.`,
    keepFiles: keep,
    affectedScreens: affectedList,
    contextSources: sources
  };
}

export function compileChat(ctx: Ctx, text: string, target?: VariantTarget): CompiledRequest {
  const screen = target?.screenId ? ctx.spec.screens.find((s) => s.id === target.screenId) : undefined;
  const el = screen && target?.elementId ? screen.elements.find((e) => e.id === target.elementId) : undefined;
  const { text: refs, sources } = contextBlocks(ctx, screen ? (e) => { const t = nodeById(ctx.canvas, e.target); return t?.type === "screen" ? t.screenId === screen.id : t?.type === "prompt"; } : undefined);
  const keep = screen ? ctx.spec.screens.filter((s) => s.id !== screen.id).map((s) => s.file) : [];
  const focus = screen
    ? `FOCUS
The designer picked ${el ? `the element "${el.label}" (data-flow-el="${el.id}", role ${el.role})` : "the whole screen"} on screen "${screen.name}" (${screen.file}). Read that file first. Change ${el ? "that element and whatever CSS it needs" : "that screen"}; do not rewrite unrelated parts of the screen, and do not open other screen files. If the change adds or removes a state, transition, or element, update flow.json to match and keep every existing id.
KEEP untouched: ${keep.length ? keep.join(", ") : "nothing"}.

`
    : "";
  const prompt = `${specSummary(ctx.spec)}

${focus}${refs ? refs + "\n\n" : ""}THE DESIGNER SAYS
${text}

If this asks for a change, make it: update the screen file it touches and flow.json, keeping ids stable, and leave other screens untouched. If it is a question, answer it in plain words without writing files. Finish with the plain-language summary.`;
  return {
    intent: "chat",
    systemPrompt: systemContract(ctx.spec),
    prompt,
    plan: screen
      ? `Edit ${el ? `"${el.label}" on` : ""} ${screen.name}: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}. Other screens are kept as they are.`
      : "Send the message to Claude with the current flow as context. Claude may edit screens and flow.json if the message asks for a change.",
    keepFiles: keep,
    affectedScreens: screen ? [screen.id] : ctx.spec.screens.map((s) => s.id),
    contextSources: sources
  };
}

export function compileVariants(ctx: Ctx, target: VariantTarget, count: number, direction: string, panelId: string, inspirationIds: string[]): CompiledRequest {
  const screen = target.screenId ? ctx.spec.screens.find((s) => s.id === target.screenId) : undefined;
  const el = screen && target.elementId ? screen.elements.find((e) => e.id === target.elementId) : undefined;
  const { text: refs, sources } = contextBlocks(ctx, (e) => {
    const t = nodeById(ctx.canvas, e.target);
    return t?.id === panelId || (t?.type === "screen" && t.screenId === target.screenId) || inspirationIds.includes(e.source);
  });
  let what: string;
  let output: string;
  if (target.token) {
    what = `the design token group "${target.token}" in tokens.css`;
    output = `For each option write variants/${panelId}/<option-id>.css containing a complete replacement tokens.css (all custom properties, not only the changed ones).`;
  } else if (el && screen) {
    what = `the element "${el.label}" (data-flow-el="${el.id}", role ${el.role}) on screen "${screen.name}" (${screen.file})`;
    output = `For each option write variants/${panelId}/<option-id>.html containing ONLY the replacement outer HTML for that element. Keep data-flow-el="${el.id}" on the root of the fragment and keep every data-flow-transition inside it. Any extra CSS the fragment needs goes in a <style> element at the start of the fragment, scoped with [data-flow-el="${el.id}"].`;
  } else if (screen) {
    what = `the whole screen "${screen.name}" (${screen.file})`;
    output = `For each option write variants/${panelId}/<option-id>.html as a complete screen document following the screen contract, with the same element ids, transitions, and states as the current screen.`;
  } else {
    what = "the project";
    output = `For each option write variants/${panelId}/<option-id>.css containing a complete replacement tokens.css.`;
  }
  const prompt = `Create ${count} distinct design variants of ${what}.

${direction ? `DIRECTION FROM THE DESIGNER\n${direction}\n\n` : ""}${refs ? refs + "\n\n" : ""}Read the current file(s) first. Each option should be a genuinely different treatment, not a colour swap, and each must still work in the flow (same ids, same transitions, same states).

OUTPUT
${output}
Then write variants/${panelId}/options.json as a JSON array of { "id": "<option-id>", "label": "<short name>", "rationale": "<one sentence on the idea>", "file": "variants/${panelId}/<file>" }.
Do not modify tokens.css, flow.json, or any screen file. Finish with the plain-language summary.`;
  return {
    intent: "variants",
    systemPrompt: systemContract(ctx.spec),
    prompt,
    plan: `Generate ${count} variants of ${what}. Nothing in the prototype changes until one is applied.`,
    keepFiles: [...ctx.spec.screens.map((s) => s.file), "tokens.css", "flow.json"],
    affectedScreens: [],
    contextSources: sources,
    variantPanelId: panelId
  };
}

export function compileDescribe(ctx: Ctx, nodeId: string): CompiledRequest {
  const node = nodeById(ctx.canvas, nodeId);
  const path = node && node.type === "inspiration" ? node.path : undefined;
  const prompt = `Look at the reference image at ${path ?? "(missing)"} using the Read tool and describe it for a designer's search index. Cover: overall style and mood, layout structure, colour palette (name hex values if you can estimate), typography, notable components or interactions, and what it would be useful as a reference for. 120 words at most, plain prose, no headings. Do not write any files.`;
  return {
    intent: "describe",
    systemPrompt: systemContract(ctx.spec),
    prompt,
    plan: "Describe the reference so it can be searched by text.",
    keepFiles: [...ctx.spec.screens.map((s) => s.file), "tokens.css", "flow.json"],
    affectedScreens: [],
    contextSources: []
  };
}
