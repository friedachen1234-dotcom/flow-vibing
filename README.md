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

## Testing without Claude

Open the demo project from the home screen. Its placeholder screens follow the contract, so navigation, states, the picker, magic lines, and change requests all work offline.

Headless end-to-end generate (needs the dev server running):

```bash
node scripts/run-agent.mjs 5191 "My App" "A brief"
```
