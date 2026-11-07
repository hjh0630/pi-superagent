import os
"""
Mailbox helper for account registration (mail.tm).

Usage:
  python tools/mailbox.py list
  python tools/mailbox.py read <id>
  python tools/mailbox.py wait <substring> [seconds]
  python tools/mailbox.py links [substring] [seconds]   # print all URLs in matching mails
"""

import json
import re
import sys
import time
import urllib.request

VAULT = os.environ.get("PI_VAULT_FILE") or os.path.join(
    os.environ.get("PI_HOME") or os.path.join(os.path.expanduser("~"), ".pi", "agent"),
    "vault",
    "mailbox.json",
)
API = "https://api.mail.tm"


def load():
    return json.load(open(VAULT, encoding="utf-8"))


def api(path, token):
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode() or "{}")


def messages(token):
    data = api("/messages?page=1", token)
    return data.get("hydra:member", data.get("member", []))


def message(mid, token):
    return api(f"/messages/{mid}", token)


def wait_for(token, needle, seconds=120):
    deadline = time.time() + seconds
    seen = set()
    while time.time() < deadline:
        for m in messages(token):
            if m["id"] in seen:
                continue
            seen.add(m["id"])
            full = message(m["id"], token)
            blob = f"{full.get('subject','')}\n{full.get('text','')}\n" + " ".join(
                str(c.get("value", "")) for c in (full.get("html") or []) if isinstance(c, dict)
            )
            if needle.lower() in blob.lower():
                return full, blob
        time.sleep(6)
    return None, ""


def urls(blob):
    return re.findall(r"https?://[^\s\"'<>)\]]+", blob)


if __name__ == "__main__":
    v = load()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    if cmd == "list":
        for m in messages(v["token"])[:15]:
            print(f"{m['id']}  {m.get('from',{}).get('address','?'):38s}  {m.get('subject','')[:70]}")
    elif cmd == "read":
        full = message(sys.argv[2], v["token"])
        print("FROM:", full.get("from", {}).get("address"))
        print("SUBJ:", full.get("subject"))
        print((full.get("text") or "")[:3000])
    elif cmd == "wait":
        needle = sys.argv[2]
        secs = int(sys.argv[3]) if len(sys.argv) > 3 else 120
        full, blob = wait_for(v["token"], needle, secs)
        if not full:
            print("NOT FOUND")
            sys.exit(1)
        print("FROM:", full.get("from", {}).get("address"))
        print("SUBJ:", full.get("subject"))
        for u in urls(blob)[:12]:
            print("URL:", u)
    elif cmd == "links":
        needle = sys.argv[2] if len(sys.argv) > 2 else ""
        secs = int(sys.argv[3]) if len(sys.argv) > 3 else 90
        full, blob = wait_for(v["token"], needle, secs) if needle else (None, "")
        if needle and not full:
            print("NOT FOUND")
            sys.exit(1)
        if not full:
            for m in messages(v["token"])[:8]:
                full = message(m["id"], v["token"])
                blob = f"{full.get('subject','')}\n{full.get('text','')}"
                print(f"{full.get('from',{}).get('address')} :: {full.get('subject')}")
                for u in urls(blob)[:10]:
                    print("  URL:", u)
        else:
            print("SUBJ:", full.get("subject"))
            for u in urls(blob)[:15]:
                print("URL:", u)
