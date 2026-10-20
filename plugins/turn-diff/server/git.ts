import { execFile } from "node:child_process";

const TIMEOUT = 8_000;

export interface Exec {
  code: number | null;
  stdout: string;
  stderr: string;
  enoent: boolean;
}

// Fixed argv only; no shell, so cwd and branch names never reach an interpreter.
export function run(
  file: string,
  args: readonly string[],
  cwd: string,
  timeout = TIMEOUT,
  maxBuffer = 1024 * 1024,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<Exec> {
  return new Promise((resolve) => {
    execFile(
      file,
      [...args],
      {
        cwd,
        timeout,
        killSignal: "SIGKILL",
        maxBuffer,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GH_PROMPT_DISABLED: "1",
          GH_NO_UPDATE_NOTIFIER: "1",
          ...extraEnv,
        },
      },
      (error, stdout, stderr) => {
        const failed = error as
          | (NodeJS.ErrnoException & { code?: unknown; killed?: boolean; signal?: string | null })
          | null;
        // A timeout kill leaves code null with partial output; it must not read as success.
        const code = !failed
          ? 0
          : failed.killed || failed.signal
            ? null
            : typeof failed.code === "number"
              ? failed.code
              : null;
        resolve({
          code,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          enoent: (error as NodeJS.ErrnoException | null)?.code === "ENOENT",
        });
      },
    );
  });
}
