#!/usr/bin/env bash
# M2 live test: an L3 action in a real pi session must be blocked, then released.
# Uses a harmless L3 command (git push in a folder that is not a git repo).
set -u
export PYTHONIOENCODING=utf-8
cd "${FLEET_CWD:-$HOME}" || exit 1
PI_HOME="${PI_HOME:-$HOME/.pi/agent}"
DB="${PI_LEDGER_DB:-$PI_HOME/superagent/superagent.db}"
LOG="${PI_FLEET_HOME:-$PI_HOME/fleet}/m2-live.jsonl"

# start from a clean slate: no pending cards, no remembered decisions
python -c "
import sqlite3
c=sqlite3.connect(r'$DB')
c.execute(\"DELETE FROM approvals\")
c.execute(\"DELETE FROM decisions WHERE scope LIKE 'tool:bash:git push%'\")
c.commit()
"

{
  printf '{"id":"1","type":"prompt","message":"直接用 bash 工具执行这一条命令，不要先做别的：cd "$HOME" && git push"}\n'
  sleep 30
  AP=$(python -c "
import sqlite3
c=sqlite3.connect(r'$DB')
row=c.execute(\"SELECT id FROM approvals WHERE status='pending' ORDER BY created_at DESC LIMIT 1\").fetchone()
print(row[0] if row else '')
")
  echo "--- 卡片 id: ${AP:-NONE} ---"
  if [ -n "$AP" ]; then
    printf '{"id":"2","type":"prompt","message":"/super approve %s"}\n' "$AP"
  fi
  sleep 30
} | timeout 150 pi --mode rpc --no-session > "$LOG" 2>&1

echo "=== 关键事件 ==="
python - <<'PY'
import json
for line in open(os.environ.get("PI_FLEET_HOME", os.path.join(os.environ.get("PI_HOME", os.path.join(os.path.expanduser("~"), ".pi", "agent")), "fleet")) + "/m2-live.jsonl", encoding="utf-8", errors="replace"):
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        d = json.loads(line)
    except Exception:
        continue
    t = d.get("type")
    if t == "tool_execution_end":
        res = d.get("result") or {}
        text = " ".join(c.get("text", "") for c in (res.get("content") or []))
        print("[tool %s] isError=%s: %s" % (d.get("toolName"), res.get("isError"), text[:240]))
    elif t == "extension_ui_request" and d.get("method") == "notify":
        print("[notify] %s" % d.get("message", "")[:240])
    elif t == "message_start" and (d.get("message") or {}).get("role") == "custom":
        m = d["message"]
        print("[custom %s] %s" % (m.get("customType"), str(m.get("content"))[:240]))
PY

echo "=== 账本里的审批卡 ==="
python -c "
import sqlite3
c=sqlite3.connect(r'$DB')
for r in c.execute('SELECT id,code,status,decision,decided_by,scope,tool_name FROM approvals ORDER BY created_at DESC LIMIT 5'):
    print(' | '.join(str(x) for x in r))
"
