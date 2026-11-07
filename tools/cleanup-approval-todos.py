"""Clean up the approval todos this test created on the phone."""
import json
import os
import subprocess

DWS = os.path.join(os.environ.get("APPDATA", ""), "npm", "dws.cmd")


def run(args):
    return subprocess.run(
        [DWS] + args,
        capture_output=True, text=True, encoding="utf-8", errors="replace", shell=True,
    )


out = run(["todo", "+get-my-tasks", "--status", "false", "--size", "20",
           "--role-types", "creator,executor,participant", "--format", "json"])
try:
    todos = json.loads(out.stdout).get("todos", [])
except Exception as exc:
    print("parse failed:", exc, out.stdout[:200], out.stderr[:200])
    todos = []

hits = [(t.get("taskId"), t.get("subject")) for t in todos if "[审批" in (t.get("subject") or "")]
print("approval todos:", hits)
for task_id, subject in hits:
    res = run(["todo", "task", "delete", "--task-id", str(task_id), "--yes"])
    print("deleted", task_id, subject, "->", res.stdout.strip()[:120])
if not hits:
    print("nothing to clean")
