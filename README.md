# Flow Vibing

Prototypes that are also flows. Write a brief, let Claude build the screens, then edit the flow chart or the prototype and regenerate only what changed. Everything about a design project lives on one canvas: screens, states, transitions, edge cases, references, skills, variants, and versions.

## Run it

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5180. The API server runs on 5191. Override with `PORT` and `FLOW_PORT`.

Claude runs through the Claude Agent SDK using your existing Claude Code login. No API key is stored. Model and effort default to `claude-opus-5` at `high`; override with `FLOW_MODEL` and `FLOW_EFFORT`.

Projects are folders under `./projects` (override with `FLOW_PROJECTS`). Each is a git repository; the version bar is its history.

## Layout

```
packages/
  shared/    Zod schemas: Design Spec, canvas graph, change requests, versions, websocket protocol. Fixtures and tests.
  server/    Fastify API + websocket. Project storage, git versions, prompt compiler, Agent SDK session, output validation.
  web/       React + xyflow canvas. Prototype view, flow view, inspector, Claude panel, version bar.
  runtime/   The prototype shell: stitches one-HTML-per-screen prototypes into a navigable app; injected screen agent for states and element picking.
dev.mjs      Starts server and web together.
scripts/     run-agent.mjs: headless end-to-end generate for testing.
examples/    Hand-built sample projects (flow.json, tokens.css, screens/) loadable from the home screen.
```

## The idea in one paragraph

Claude writes a Design Spec (`flow.json`) alongside the screens. The flow view renders the spec. The prototype view runs the screens through a runtime shell that reads transitions from the spec. Editing the flow produces structured change requests; applying them regenerates only the affected screens, with the rest passed to Claude as keep-as-is. Every generation, change, and variant is a git commit shown as a version.

## Project folder

```
flow.json      Design Spec (screens, states, transitions, edge cases, tokens, components, provenance)
canvas.json    Node positions, magic lines, notes, variant panels, viewport
tokens.css     Shared design tokens as CSS custom properties
screens/       One standalone HTML document per screen
inspirations/  Dropped images and captures
skills/        Dropped markdown skills
variants/      Generated alternatives per variant panel
.flow/         Session id and compiled prompts per run
```

## Screen HTML contract

The runtime depends on these, and the validator checks them:

- Standalone document with `<html data-flow-screen="<id>">` and `<link rel="stylesheet" href="../tokens.css">`.
- Elements that navigate carry `data-flow-el="<element-id>"` and `data-flow-transition="<transition-id> [more ids for branches]"`. Never `<a href>` between screens.
- States are styled with `html[data-flow-state="<state-id>"]` selectors. The default state renders with no attribute.
- No external scripts, fonts, or images.

## Interface

The board is the whole surface; the chrome floats over it and gets out of the way.

- **Top bar**: breadcrumb to the project (its menu has History, Export, and Regenerate), the Prototype / Flow toggle, the save status, a Claude panel toggle, Share, and **Run prototype**, which walks the flow full screen from any screen.
- **Rail** (left, floating): Select, Hand, Pick an element, then Note and Reference, then Present.
- **Composer** (bottom): the one place to talk to Claude. It knows its target: the picked element, the selected screen, or the whole project. Type to ask for a change, or press **Generate variants** to explore alternatives of the target side by side. Queued changes are applied from here too.
- **Panel** (right, floating): Live preview, Inspect, Claude, History. In flow view, selecting a screen or an edge case opens Live preview: the screen running at reading size with a Simulate menu for its states. Closed by default; a tab on the edge reopens it.
- **Flow view**: a Start marker, one card per screen with a thumbnail, its states and edge-case counts, and one row per interaction. Each row is where its line starts, and the line carries the trigger as a label. Edge cases are amber cards hanging under their screen on dashed lines; the toggle at the top right hides them.
- **Prototype view**: every screen live, with a Live badge, a state menu, and a selection frame with handles on the picked element. Variants appear as an exploration panel beside the screen; hover an option to preview it in place, Apply to make it real.
- **Canvas bar** (bottom): zoom, fit, tidy, influences, Map, and `?` for the shortcut list. Scroll pans, pinch or ⌘-scroll zooms, ⌘= / ⌘− / ⌘0 match the browser.

Projects reopen on their content: if the saved viewport frames empty board, the canvas fits to what exists instead.

## Testing without Claude

Open the demo project from the home screen. Its placeholder screens follow the contract, so navigation, states, the picker, magic lines, and change requests all work offline.

For something closer to real output, load one of the example prototypes from the home screen. They live in `examples/` and are copied into `projects/` as a fresh project with its own history:

- **Lumen Bank** (mobile): send-money flow with loading, offline, invalid-amount, sending, and declined states, plus branching on Continue and Confirm.
- **Relay Desk** (desktop): support inbox with a ticket thread, a modal new-ticket form, and a reports page. Same-screen transitions flip the ticket to replied, escalated, or resolved.
- **Plated** (tablet): recipe browser, recipe page, step-by-step cook mode with a timer state and a finish overlay, and an aisle-grouped shopping list.

Each example also ships a board: two reference cards pointed at a screen with a style line, and a variants exploration of one element (the recovery ring, the balance card, the KPI row, the cook step) with three alternatives ready to hover and apply. They live in `board.json`, `inspirations/`, and `variants/` beside the screens, and `scripts/example-boards.mjs` regenerates them.

Each example is checked by `packages/server/src/examples.test.ts`: the spec lints clean, every declared element and transition exists in the markup, every non-default state has styling, `tokens.css` matches the spec tokens, and the board's files exist and keep each variant's `data-flow-el`. To add one, create `examples/<id>/` with `flow.json` (its `id` must match the folder), `screens/`, and a `tokens.css` generated from the spec, then run `pnpm test`.

Headless end-to-end generate (needs the dev server running):

```bash
node scripts/run-agent.mjs 5191 "My App" "A brief"
```
