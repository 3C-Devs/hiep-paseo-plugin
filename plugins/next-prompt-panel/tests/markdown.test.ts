import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBlocks, parseInline } from "../shared/markdown";

test("reads headings, paragraphs, rules, quotes, and fenced code", () => {
  assert.deepEqual(
    parseBlocks(
      "## Done\n\nFirst line\nsecond line\n\n---\n\n> quoted\n\n```ts\nconst a = 1;\n\n// kept\n```",
    ),
    [
      { kind: "heading", level: 2, text: "Done" },
      { kind: "paragraph", text: "First line\nsecond line" },
      { kind: "rule" },
      { kind: "quote", blocks: [{ kind: "paragraph", text: "quoted" }] },
      { kind: "code", language: "ts", text: "const a = 1;\n\n// kept" },
    ],
  );
});

test("reads ordered and nested lists without merging the next block", () => {
  assert.deepEqual(parseBlocks("3. three\n4. four\n   more\n\nAfter"), [
    {
      kind: "list",
      ordered: true,
      start: 3,
      items: [
        { text: "three", children: [] },
        { text: "four more", children: [] },
      ],
    },
    { kind: "paragraph", text: "After" },
  ]);
  assert.deepEqual(parseBlocks("- parent\n  - child\n- next"), [
    {
      kind: "list",
      ordered: false,
      start: 1,
      items: [
        {
          text: "parent",
          children: [
            { kind: "list", ordered: false, start: 1, items: [{ text: "child", children: [] }] },
          ],
        },
        { text: "next", children: [] },
      ],
    },
  ]);
});

test("keeps a table as monospace text", () => {
  assert.deepEqual(parseBlocks("| a | b |\n|---|---|\n| 1 | 2 |"), [
    { kind: "code", language: "table", text: "| a | b |\n|---|---|\n| 1 | 2 |" },
  ]);
});

test("reads bold, italic, code spans, and links; unmatched markers stay text", () => {
  assert.deepEqual(parseInline("**Done** with `npm test`, see [docs](https://x.test) *now*"), [
    { kind: "bold", children: [{ kind: "text", text: "Done" }] },
    { kind: "text", text: " with " },
    { kind: "code", text: "npm test" },
    { kind: "text", text: ", see " },
    { kind: "link", href: "https://x.test", children: [{ kind: "text", text: "docs" }] },
    { kind: "text", text: " " },
    { kind: "italic", children: [{ kind: "text", text: "now" }] },
  ]);
  assert.deepEqual(parseInline("a * b and snake_case_name"), [
    { kind: "text", text: "a * b and snake_case_name" },
  ]);
  // Markers inside a code span are literal.
  assert.deepEqual(parseInline("`**x**`"), [{ kind: "code", text: "**x**" }]);
});
