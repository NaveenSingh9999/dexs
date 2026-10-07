import { execFile } from "child_process";
import { promisify } from "util";

const run = promisify(execFile);

export interface Injector {
  type(text: string): Promise<void>;
  backspace(count: number): Promise<void>;
  paste(text: string): Promise<void>;
}

const LONG_TEXT = 200;

export function pickStrategy(text: string): "type" | "paste" {
  return text.length > LONG_TEXT || /[^\x20-\x7E]/.test(text)
    ? "paste"
    : "type";
}

export function createInjector(
  platform: NodeJS.Platform = process.platform,
): Injector {
  if (platform === "win32") return windowsInjector();
  return x11Injector();
}

function x11Injector(): Injector {
  return {
    async type(text) {
      await run("xdotool", ["type", "--delay", "8", "--", text]);
    },
    async backspace(count) {
      for (let i = 0; i < count; i++)
        await run("xdotool", ["key", "BackSpace"]);
    },
    async paste(text) {
      await run("xclip", ["-selection", "clipboard"], {
        input: text,
      } as never).catch(async () => {
        const { execFile: exec } = await import("child_process");
        await new Promise<void>((resolve, reject) => {
          const p = exec("xclip", ["-selection", "clipboard"], (e) =>
            e ? reject(e) : resolve(),
          );
          p.stdin!.end(text);
        });
      });
      await run("xdotool", ["key", "ctrl+v"]);
    },
  };
}

function windowsInjector(): Injector {
  return {
    async type(text) {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escapePs(text)}')`;
      await run("powershell", ["-NoProfile", "-Command", ps]);
    },
    async backspace(count) {
      const keys = "{BACKSPACE}".repeat(Math.min(count, 4000));
      const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')`;
      await run("powershell", ["-NoProfile", "-Command", ps]);
    },
    async paste(text) {
      const ps = `Set-Clipboard -Value '${text.replace(/'/g, "''")}'; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`;
      await run("powershell", ["-NoProfile", "-Command", ps]);
    },
  };
}

function escapePs(s: string): string {
  return s.replace(/'/g, "''").replace(/([+^%~(){}[\]])/g, "{$1}");
}

export async function applyCorrection(
  inj: Injector,
  backspaces: number,
  insert: string,
): Promise<void> {
  if (backspaces > 0) {
    if (backspaces <= 4000) await inj.backspace(backspaces);
    else {
      await inj.paste("");
      return;
    }
  }
  if (!insert) return;
  if (pickStrategy(insert) === "type") await inj.type(insert);
  else await inj.paste(insert);
}
