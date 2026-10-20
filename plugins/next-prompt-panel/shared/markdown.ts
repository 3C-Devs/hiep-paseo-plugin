// A small Markdown reader for the reply text the panel replaces. Paseo 0.12 gives plugins no
// Markdown component, and a timeline transformer replaces the whole reply, so the panel renders
// the reply body itself. It covers what agent replies use; anything else stays readable as text.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] };

export type ListItem = { text: string; children: Block[] };
export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "rule" };

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", language: fence[2], text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    // Tables keep their columns in monospace instead of a grid.
    if (/^\s*\|/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(lines[i++].trim());
      blocks.push({ kind: "code", language: "table", text: body.join("\n") });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(QUOTE.exec(lines[i++])![1]);
      blocks.push({ kind: "quote", blocks: parseBlocks(body.join("\n")) });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      const indent = item[1].length;
      const ordered = /\d/.test(item[2]);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const next = ITEM.exec(lines[i]);
        if (!next || next[1].length !== indent || /\d/.test(next[2]) !== ordered) break;
        const text = [next[3]];
        const nested: string[] = [];
        i++;
        // Continuation lines and nested lists belong to this item while they are indented.
        while (i < lines.length && lines[i].trim() && /^\s/.test(lines[i])) {
          const deeper = ITEM.exec(lines[i]);
          if (deeper && deeper[1].length <= indent) break;
          if (deeper || nested.length) nested.push(lines[i].slice(indent + 2));
          else text.push(lines[i].trim());
          i++;
        }
        items.push({
          text: text.join(" "),
          children: nested.length ? parseBlocks(nested.join("\n")) : [],
        });
        // A blank line between items keeps the list going.
        if (!lines[i]?.trim() && ITEM.exec(lines[i + 1] ?? "")?.[1].length === indent) i++;
      }
      blocks.push({ kind: "list", ordered, start: ordered ? parseInt(item[2], 10) : 1, items });
      continue;
    }
    const text: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !ITEM.test(lines[i]) &&
      !RULE.test(lines[i])
    )
      text.push(lines[i++].trim());
    blocks.push({ kind: "paragraph", text: text.join("\n") });
  }
  return blocks;
}

/** Bold, italic, code spans, and links. Unmatched markers stay as text. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ kind: "text", text });
    text = "";
  };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const code = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest);
    if (code) {
      flush();
      out.push({ kind: "code", text: code[2].replace(/^ (.*) $/, "$1") });
      i += code[0].length;
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ kind: "link", href: link[2], children: parseInline(link[1]) });
      i += link[0].length;
      continue;
    }
    const bold = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest);
    if (bold) {
      flush();
      out.push({ kind: "bold", children: parseInline(bold[2]) });
      i += bold[0].length;
      continue;
    }
    const italic = /^(\*|_)(?=\S)([\s\S]*?\S)\1(?![\w*])/.exec(rest);
    if (italic && (italic[1] === "*" || !/\w/.test(source[i - 1] ?? ""))) {
      flush();
      out.push({ kind: "italic", children: parseInline(italic[2]) });
      i += italic[0].length;
      continue;
    }
    text += source[i++];
  }
  flush();
  return out;
}
