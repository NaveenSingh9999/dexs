import { execFile } from "child_process";
import { promisify } from "util";
import {
  decideDelivery,
  deliveryMessage,
  type AccessibilityAnswer,
  type DeliveryResult,
} from "../core/delivery";

const run = promisify(execFile);

export interface Injector {
  /** Is the focused element an editable text control? */
  target(): Promise<AccessibilityAnswer | null>;
  /** Put text on the clipboard and press the platform paste chord. */
  paste(text: string): Promise<void>;
  copy(text: string): Promise<void>;
  /** Verify, then paste, fall back to the clipboard, or do nothing. */
  deliver(
    text: string,
    opts?: { clipboardFallback?: boolean },
  ): Promise<DeliveryResult | null>;
}

export function createInjector(
  platform: NodeJS.Platform = process.platform,
): Injector {
  const x11 = platform !== "win32";
  return {
    target: () => (x11 ? linuxTarget() : windowsTarget()),
    copy: (text) => (x11 ? copyLinux(text) : copyWindows(text)),
    async paste(text) {
      if (x11) {
        await copyLinux(text);
        await run("xdotool", ["key", "ctrl+v"]);
      } else {
        await pasteWindows(text);
      }
    },
    async deliver(text, opts) {
      const decision = decideDelivery(text, await this.target(), {
        clipboardFallback: opts?.clipboardFallback,
      });
      if (decision.kind === "paste") await this.paste(text);
      else if (decision.kind === "clipboard") await this.copy(text);
      const where =
        decision.kind === "paste"
          ? "window"
          : decision.kind === "clipboard"
            ? "clipboard"
            : "none";
      return {
        where,
        reason: decision.reason,
        message: deliveryMessage({ where, reason: decision.reason }),
      };
    },
  };
}

/**
 * Linux: ask AT-SPI whether the focused object is a text entry. If the
 * bridge is missing (very common in a bare container) we cannot verify, so we
 * say so instead of typing into whatever happens to be focused.
 */
async function linuxTarget(): Promise<AccessibilityAnswer | null> {
  const script = `
import sys
try:
    import pyatspi
except Exception:
    print("NO_BRIDGE"); sys.exit(0)
try:
    obj = pyatspi.Registry.getDesktop(0).getChildAtIndex(0)
    # walk to the deepest focused object
    while obj is not None and obj.childCount > 0:
        found = None
        for i in range(min(obj.childCount, 64)):
            child = obj.getChildAtIndex(i)
            if child is not None and getattr(child, "getState", None) and child.getState().contains(pyatspi.STATE_FOCUSED):
                found = child
                break
        if found is None: break
        obj = found
    role = obj.getRoleName().lower() if obj is not None else ""
    editable = any(k in role for k in ("text", "entry", "edit", "document", "paragraph"))
    print("EDITABLE" if editable else "NOT_EDITABLE")
except Exception:
    print("QUERY_FAILED")
`;
  try {
    const { stdout } = await run("python3", ["-c", script], { timeout: 4000 });
    const out = stdout.trim().split("\n").pop() ?? "";
    if (out === "NO_BRIDGE") return null;
    if (out === "QUERY_FAILED")
      return { editable: false, error: "query-failed" };
    return { editable: out === "EDITABLE" };
  } catch {
    return null;
  }
}

/** Windows: UI Automation tells us the focused control's type. */
async function windowsTarget(): Promise<AccessibilityAnswer | null> {
  const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
try {
  $el = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -eq $el) { Write-Output "NO_FOCUS"; exit 0 }
  $ct = $el.Current.ControlType.ProgrammaticName
  $editable = $ct -match "Edit|Document|ComboBox"
  Write-Output ("EDITABLE:" + $editable)
} catch { Write-Output "QUERY_FAILED" }
`;
  try {
    const { stdout } = await run(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 6000 },
    );
    const out = stdout.trim();
    if (out.startsWith("EDITABLE:")) {
      return { editable: out.slice("EDITABLE:".length).trim() === "True" };
    }
    if (out === "NO_FOCUS") return { editable: false };
    return { editable: false, error: "query-failed" };
  } catch {
    return { editable: false, error: "query-failed" };
  }
}

async function copyLinux(text: string): Promise<void> {
  const bin = (await has("xclip"))
    ? "xclip"
    : (await has("xsel"))
      ? "xsel"
      : null;
  if (!bin) return;
  await new Promise<void>((resolve, reject) => {
    const p = execFile(bin, ["-selection", "clipboard"], (e) =>
      e ? reject(e) : resolve(),
    );
    p.stdin!.end(text);
  });
}

async function copyWindows(text: string): Promise<void> {
  const ps = `Set-Clipboard -Value ${psQuote(text)}`;
  await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps]);
}

async function pasteWindows(text: string): Promise<void> {
  const ps = `Set-Clipboard -Value ${psQuote(text)}; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")`;
  await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps]);
}

function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function has(bin: string): Promise<boolean> {
  try {
    await run("which", [bin]);
    return true;
  } catch {
    return false;
  }
}
