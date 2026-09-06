/** HTML helpers for splicing variant fragments into screens. */
/** Returns the outer HTML of the element carrying data-flow-el="id", or null. */
export function extractElement(html: string, elementId: string): string | null {
  const marker = `\u0000FLOW-EXTRACT\u0000`;
  const spliced = spliceElement(html, elementId, marker);
  if (!spliced) return null;
  const start = spliced.indexOf(marker);
  const tail = spliced.slice(start + marker.length);
  // The original is what the splice removed: everything between the prefix and the suffix that survived.
  const prefix = spliced.slice(0, start);
  return html.slice(prefix.length, html.length - tail.length);
}

/**
 * Replaces the outer HTML of the element carrying data-flow-el="id" with the fragment.
 * Works by locating the opening tag, then walking tags to find the matching close. Handles void elements.
 */
export function spliceElement(html: string, elementId: string, fragment: string): string | null {
  const openRe = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)(\\s[^>]*?)?\\sdata-flow-el=["']${elementId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "m");
  const m = openRe.exec(html);
  if (!m) return null;
  const start = m.index;
  const tag = m[1].toLowerCase();
  const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "source", "track", "wbr", "area", "base", "col", "embed", "param"]);
  if (VOID.has(tag) || m[0].endsWith("/>")) return html.slice(0, start) + fragment + html.slice(start + m[0].length);
  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  tagRe.lastIndex = start + m[0].length;
  let depth = 1;
  let mm: RegExpExecArray | null;
  while ((mm = tagRe.exec(html))) {
    if (mm[0].startsWith("</")) depth--; else if (!mm[0].endsWith("/>")) depth++;
    if (depth === 0) return html.slice(0, start) + fragment + html.slice(mm.index + mm[0].length);
  }
  return null;
}
