/**
 * A small, safe reader for the Markdown Zorax writes: paragraphs, emphasis, lists,
 * tables, quotes, code and links. It produces a tree, never HTML, so nothing from a
 * model answer can inject markup. Only CRM paths and https links become links.
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "br" };

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; start: number; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "code"; v: string }
  | { t: "hr" };

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const ORDERED = /^\s*(\d+)[.)]\s+/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Links Zorax may offer: screens of the CRM and public https pages. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^\/dashboard(?:\/[\w\-/]*)?$/.test(href)) return href;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => { if (text) { out.push({ t: "text", v: text }); text = ""; } };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    let m: RegExpMatchArray | null;
    if (rest.startsWith("\n")) { flush(); out.push({ t: "br" }); i += 1; continue; }
    if ((m = rest.match(/^`([^`\n]+)`/))) { flush(); out.push({ t: "code", v: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^(\*\*|__)(?=\S)([\s\S]+?\S)\1/))) { flush(); out.push({ t: "strong", c: parseInline(m[2]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*(?=\S)([^*\n]+?\S)\*/)) || ((i === 0 || /[\s(¿¡"']/.test(source[i - 1])) && (m = rest.match(/^_(?=\S)([^_\n]+?\S)_(?![\w])/)))) {
      flush(); out.push({ t: "em", c: parseInline(m[1]) }); i += m[0].length; continue;
    }
    if ((m = rest.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)/))) {
      flush(); const href = safeHref(m[2]);
      out.push(href ? { t: "link", href, c: parseInline(m[1]) } : { t: "text", v: m[1] });
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^https:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?]/))) {
      const href = safeHref(m[0]);
      if (href) { flush(); out.push({ t: "link", href, c: [{ t: "text", v: m[0] }] }); i += m[0].length; continue; }
    }
    text += source[i]; i += 1;
  }
  flush();
  return out;
}

const cells = (line: string) => {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map(cell => parseInline(cell.replace(/\\\|/g, "|").trim()));
};

export function parseRichText(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ t: "p", c: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { flushParagraph(); continue; }
    if (/^\s*```/.test(line)) {
      flushParagraph();
      const code: string[] = [];
      for (i += 1; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      blocks.push({ t: "code", v: code.join("\n") });
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushParagraph(); blocks.push({ t: "hr" }); continue; }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) { flushParagraph(); blocks.push({ t: "h", level: Math.min(heading[1].length, 3) as 1 | 2 | 3, c: parseInline(heading[2]) }); continue; }
    if (/^\s*>/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ""));
      i -= 1;
      blocks.push({ t: "quote", c: parseInline(quote.join("\n")) });
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flushParagraph();
      const head = cells(line);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]));
      i -= 1;
      blocks.push({ t: "table", head, rows });
      continue;
    }
    if (BULLET.test(line)) {
      flushParagraph();
      const ordered = ORDERED.exec(line);
      const items: Inline[][] = [];
      let start = ordered ? Number(ordered[1]) : 1;
      for (; i < lines.length && BULLET.test(lines[i]) && Boolean(ORDERED.test(lines[i])) === Boolean(ordered); i++) {
        let item = lines[i].replace(BULLET, "");
        // Continuation lines indented under the bullet belong to the same item.
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !BULLET.test(lines[i + 1])) { item += "\n" + lines[i + 1].trim(); i += 1; }
        items.push(parseInline(item));
      }
      i -= 1;
      if (!Number.isFinite(start) || start < 1) start = 1;
      blocks.push(ordered ? { t: "ol", start, items } : { t: "ul", items });
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

/** Plain text of a tree, for clipboard and accessibility. */
export function plainText(blocks: Block[]): string {
  const inline = (nodes: Inline[]): string => nodes.map(node => node.t === "text" || node.t === "code" ? node.v : node.t === "br" ? "\n" : inline(node.c)).join("");
  return blocks.map(block => {
    switch (block.t) {
      case "p": case "h": case "quote": return inline(block.c);
      case "ul": return block.items.map(item => `• ${inline(item)}`).join("\n");
      case "ol": return block.items.map((item, index) => `${block.start + index}. ${inline(item)}`).join("\n");
      case "table": return [block.head, ...block.rows].map(row => row.map(inline).join(" · ")).join("\n");
      case "code": return block.v;
      case "hr": return "";
    }
  }).join("\n\n").trim();
}
