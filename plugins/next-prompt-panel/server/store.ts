import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const entrySchema = z.object({
  handled: z.record(z.string(), z.enum(["sending", "sent", "unknown"])),
});
const dataSchema = z.record(z.string(), entrySchema);
export type Entry = z.infer<typeof entrySchema>;
export class Store {
  readonly data: Record<string, Entry>;
  constructor(private file?: string) {
    this.data =
      file && existsSync(file) ? dataSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : {};
    for (const state of Object.values(this.data))
      for (const key of Object.keys(state.handled))
        if (state.handled[key] === "sending") state.handled[key] = "unknown";
  }
  get(id: string): Entry {
    return (this.data[id] ??= { handled: {} });
  }
  save() {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file + ".tmp", JSON.stringify(this.data), { mode: 0o600 });
    renameSync(this.file + ".tmp", this.file);
  }
}
