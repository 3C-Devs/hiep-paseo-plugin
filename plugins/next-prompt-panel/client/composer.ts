import { Platform } from "react-native";

// Paseo 0.12 has no plugin API to fill the composer, so Edit writes into the web composer field.
// Native clients have no such field access; they hide Edit.
type Field = {
  value: string;
  focus?(): void;
  setSelectionRange?(start: number, end: number): void;
  dispatchEvent(event: unknown): boolean;
};
type Node = { parentElement: Node | null; contains?(other: unknown): boolean };
type Doc = {
  querySelectorAll(selector: string): ArrayLike<Field>;
  defaultView?: { Event: new (type: string, init: { bubbles: boolean }) => unknown } | null;
};

export const canFillComposer = Platform.OS === "web";

// The host marks the composer field with dataSet={{composerInput:""}}; the root testID is the
// fallback for hosts that predate it.
const FIELDS = ["[data-composer-input]", '[data-testid="message-input-root"] textarea'];

/**
 * Several conversations can stay mounted at once, so prefer the composer sharing the closest
 * ancestor with the panel rather than whichever comes first in the document.
 */
export function fillComposer(text: string, anchor: unknown): string {
  const doc = (globalThis as { document?: Doc }).document;
  if (!doc) return "Composer not found.";
  const fields = FIELDS.flatMap((selector) => Array.from(doc.querySelectorAll(selector)));
  let field = fields.length < 2 ? fields[0] : undefined;
  for (let node = anchor as Node | null; !field && node; node = node.parentElement)
    field = fields.find((candidate) => node!.contains?.(candidate));
  field ??= fields[fields.length - 1];
  const view = doc.defaultView;
  if (!field || !view) return "Composer not found. Open the conversation, then try again.";
  // The field is uncontrolled, but React still tracks the last value it saw: write through the
  // prototype setter and replay the input event so the host adopts the new text.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
  if (setter) setter.call(field, text);
  else field.value = text;
  field.dispatchEvent(new view.Event("input", { bubbles: true }));
  field.focus?.();
  field.setSelectionRange?.(text.length, text.length);
  return field.value === text ? "" : "The composer did not accept the text.";
}
