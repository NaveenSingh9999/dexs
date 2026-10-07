import { spawn } from "child_process";

const PROMPT = `Fix grammar, punctuation, and formatting. Preserve meaning and wording. Output only the corrected text, nothing else.`;

export function cleanText(
  llmBin: string,
  llmModel: string,
  text: string,
  timeoutMs = 15000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!llmBin) return resolve(text);
    const p = spawn(llmBin, ["-m", llmModel, "--temp", "0", "-n", "256", "-p", `${PROMPT}\n\n${text}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const to = setTimeout(() => {
      p.kill();
      reject(new Error("llm timeout"));
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => {
      clearTimeout(to);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(to);
      if (code === 0) resolve(out.trim() || text);
      else reject(new Error(`llm exit ${code}: ${err}`));
    });
  });
}
