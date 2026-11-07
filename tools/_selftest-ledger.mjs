import { getDb, nowIso } from "../store/db.ts";
import { enqueueOutbox, pendingOutbox, markOutboxSent } from "../store/ledger.ts";
import { createApproval, extendApproval, decideApproval, expireStaleApprovals } from "../store/approvals.ts";

const db = getDb();
let fail = 0;
const check = (name, ok, extra = "") => {
	if (!ok) fail++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

// 1) an old alert must not be delivered
const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
db.prepare("INSERT INTO outbox (ts, channel, kind, payload, status, attempts) VALUES (?, 'stream', 'alert', 'OLD ALERT', 'pending', 0)").run(old);
const fresh = enqueueOutbox("stream", "alert", "FRESH ALERT");
const delivered = pendingOutbox(50);
const gotOld = delivered.some((d) => d.payload === "OLD ALERT");
const gotFresh = delivered.some((d) => d.payload === "FRESH ALERT");
check("两小时前的告警不再投递", !gotOld);
check("刚产生的告照照投递", gotFresh);
const oldRow = db.prepare("SELECT status FROM outbox WHERE payload = 'OLD ALERT'").get();
check("旧告警标记为 stale", oldRow.status === "stale", `status=${oldRow.status}`);
markOutboxSent(fresh);

// 2) a card can be extended while it is still pending
const card = createApproval({ title: "selftest", level: "L3", scope: "tool:bash:rm -r", toolName: "bash", args: { command: "rm -rf /tmp/x" }, expiresMinutes: 30 });
const before = Date.parse(card.expires_at);
const ext = extendApproval(card.id, 60);
const after = Date.parse(ext.approval.expires_at);
check("延期成功", ext.ok === true);
check("截止时间往后推了 60 分钟", after - before === 60 * 60 * 1000, `${Math.round((after - before) / 60000)}min`);
const decided = decideApproval(card.id, "allow_once", "human");
check("延期不等于批准（仍需点头）", decided.ok === true && decided.approval.status === "approved");

// 3) an expired card cannot be approved, only extended
const old2 = createApproval({ title: "selftest-expired", level: "L3", scope: "tool:bash:rm -r", toolName: "bash", args: { command: "rm -rf /tmp/y" }, expiresMinutes: 1 });
db.prepare("UPDATE approvals SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), old2.id);
const expiredList = expireStaleApprovals();
check("过期卡被标记 expired", expiredList.includes(old2.id));
const late = decideApproval(old2.id, "allow_once", "human");
check("过期卡不能被批准", late.ok === false, late.reason ?? "");
const extendExpired = extendApproval(old2.id, 30);
check("过期卡不能再延期", extendExpired.ok === false, extendExpired.reason ?? "");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
