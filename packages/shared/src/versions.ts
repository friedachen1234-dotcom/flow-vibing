import { z } from "zod";

export const VersionKind = z.enum(["init", "generate", "regenerate", "variant", "edit", "restore", "import"]);
export type VersionKind = z.infer<typeof VersionKind>;

export const Version = z.object({
  id: z.string().describe("git commit sha"),
  kind: VersionKind,
  summary: z.string(),
  createdAt: z.string(),
  screens: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  label: z.string().optional()
});
export type Version = z.infer<typeof Version>;

/** Commit message format: first line is the summary, then a JSON trailer the server parses back. */
export function encodeVersionMessage(v: Omit<Version, "id" | "createdAt">): string {
  return `${v.summary}\n\nflow-version: ${JSON.stringify({ kind: v.kind, screens: v.screens, pinned: v.pinned, label: v.label })}`;
}

export function decodeVersionMessage(message: string): { summary: string; kind: VersionKind; screens: string[]; pinned: boolean; label?: string } {
  const [summary, ...rest] = message.split("\n");
  const trailer = rest.join("\n").match(/flow-version:\s*(\{.*\})/);
  let meta: { kind?: VersionKind; screens?: string[]; pinned?: boolean; label?: string } = {};
  if (trailer) {
    try { meta = JSON.parse(trailer[1]); } catch { /* fall through */ }
  }
  return {
    summary: summary ?? "",
    kind: meta.kind && VersionKind.safeParse(meta.kind).success ? meta.kind : "edit",
    screens: meta.screens ?? [],
    pinned: meta.pinned ?? false,
    label: meta.label
  };
}
