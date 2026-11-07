import { spawn } from "node:child_process";
import { homedir } from "node:os";
const cmd = process.argv[2];
const p = spawn(process.env.PI_CLI || "pi.cmd",
  ["--mode", "rpc", "--no-session"], { cwd: process.env.FLEET_CWD || homedir(), shell: true, stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
p.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.type === "extension_ui_request" && r.method === "notify") console.log("[notify]", r.message);
      else if (r.type === "message_end" && r.message?.role === "assistant") {
        const t = (r.message.content ?? []).filter(b => b?.type === "text").map(b => b.text).join("").trim();
        if (t) console.log("[assistant]", t.slice(0, 1200));
      }
      else if (r.type === "tool_execution_end") console.log("[tool]", JSON.stringify(r).slice(0, 400));
      else if (r.type === "response") console.log("[resp]", r.command, r.success, JSON.stringify(r.data ?? r.error).slice(0, 400));
    } catch {}
  }
});
p.stderr.on("data", d => process.stderr.write("[stderr] " + String(d).slice(0, 400) + "\n"));
if (cmd) p.stdin.write(JSON.stringify({ id: "1", type: "prompt", message: cmd }) + "\n");
else p.stdin.write(JSON.stringify({ id: "1", type: "get_commands" }) + "\n");
setTimeout(() => { p.stdin.end(); p.kill(); process.exit(0); }, Number(process.argv[3] || 20) * 1000);
