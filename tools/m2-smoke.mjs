/**
 * M2 smoke test: graded autonomy + the approval gate.
 *
 * Exercises the classifier, the card lifecycle (create -> decide -> expire),
 * the decision memory and the DingTalk channel (it creates one real todo on
 * the phone and deletes it again).
 *
 * Usage: node tools/m2-smoke.mjs
 */

import { classify, policy, scopeFor } from "../store/levels.ts";
import {
	approvalCard,
	argsHash,
	createApproval,
	decideApproval,
	expireStaleApprovals,
	findApprovedByHash,
	listApprovals,
} from "../store/approvals.ts";
import { addDecision, findDecisionByScope } from "../store/ledger.ts";
import { cardSubject, deleteTodo, readApprovals, runDws, sendApprovalCard } from "../store/channels/dingtalk.ts";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra = "") {
	if (!ok) failures++;
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
}

console.log("=== 1. 分级 ===");
const cases = [
	["read", { path: "C:/x" }, "L0"],
	["write", { path: "C:/x/a.txt", content: "hi" }, "L2"],
	["edit", { path: "C:/x/a.txt" }, "L2"],
	["bash", { command: "ls -la" }, "L2"],
	["bash", { command: "git status" }, "L2"],
	["bash", { command: "git push origin main" }, "L3"],
	["bash", { command: "npm publish" }, "L3"],
	["bash", { command: "rm -rf build" }, "L3"],
	["bash", { command: "rm  -rf build" }, "L3"],
	["powershell", { command: "Remove-Item -Recurse x" }, "L3"],
	["mcp__dingtalk__send", { text: "hi" }, "L2"],
	["assign_model", { provider: "pi", task: "t" }, "L2"],
	["some_unknown_tool", { a: 1 }, "L1"],
];
for (const [tool, input, expected] of cases) {
	const c = classify(tool, input);
	check(`${tool} ${JSON.stringify(input).slice(0, 40)} → ${c.level}`, c.level === expected, `matched=${c.matched ?? "-"} scope=${c.scope}`);
}
console.log("policy:", JSON.stringify(policy().defaultLevel), policy().expiresMinutes, "min ·", policy().channels.join(","));

console.log("\n=== 2. 卡片生命周期 ===");
const uniqueCommand = `git push origin main --m2-smoke-${Date.now()}`;
const card = createApproval({
	title: `bash: ${uniqueCommand}`,
	detail: "命中规则：git push",
	level: "L3",
	scope: scopeFor("bash", "git push"),
	toolName: "bash",
	args: { command: uniqueCommand },
	expiresMinutes: 10,
});
console.log("card:", card.id, card.code, "scope:", card.scope);
console.log(approvalCard(card).split("\n").slice(0, 3).join(" / "));

const hash = argsHash("bash", { command: uniqueCommand });
check("同一动作有 args_hash", findApprovedByHash(hash) === undefined, "尚未批准 → 未命中");

const decided = decideApproval(card.id, "allow_once", "human");
check("批准一次", decided.ok && decided.approval?.status === "approved");
check("批准后同动作命中", findApprovedByHash(hash)?.id === card.id);

console.log("\n=== 3. 过期=未放行 ===");
const stale = createApproval({
	title: "bash: npm publish",
	level: "L3",
	scope: scopeFor("bash", "npm publish"),
	toolName: "bash",
	args: { command: "npm publish" },
	expiresMinutes: 1,
});
await sleep(1200);
// push the expiry into the past to test without waiting a minute
const { getDb } = await import("../store/db.ts");
getDb().prepare("UPDATE approvals SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), stale.id);
const late = decideApproval(stale.id, "allow_once", "human");
check("过期后批准被拒", !late.ok, late.reason);
const expiredList = expireStaleApprovals();
check("过期卡被标记 expired", listApprovals(10, "expired").some((a) => a.id === stale.id), `本轮过期 ${expiredList.length}`);

console.log("\n=== 4. 决策记忆（always） ===");
addDecision({ kind: "decided", scope: "tool:bash:git push", text: "永久放行 git push", source: "human" });
const remembered = classify("bash", { command: "git push origin main" });
check("同 scope 记住批准", remembered.remembered?.kind === "decided", remembered.remembered?.text ?? "");
check("不同动作不继承", classify("bash", { command: "npm publish" }).remembered === undefined);
console.log("decisions:", findDecisionByScope("tool:bash:git push"));
// A test must not leave a standing "always allow" behind — that would open the
// gate for the whole machine. Clean up after ourselves.
getDb().prepare("DELETE FROM decisions WHERE scope = ?").run("tool:bash:git push");
check("测试不残留常设授权", findDecisionByScope("tool:bash:git push") === undefined);

console.log("\n=== 5. 钉钉通道 ===");
const dwsCard = createApproval({
	title: "M2 冒烟：测试待办",
	level: "L3",
	scope: "tool:bash:m2-smoke",
	toolName: "bash",
	args: { command: "m2-smoke" },
	expiresMinutes: 30,
});
const subject = cardSubject(dwsCard);
console.log("待办标题:", subject);
const sent = await sendApprovalCard(dwsCard);
check("钉钉待办已创建", sent.ok, sent.note ?? `taskId=${sent.taskId}`);

await sleep(1500);
const read = await readApprovals();
check("钉钉待办可读回", read.ok && read.open.has(dwsCard.code), `open=${[...read.open].join(",")} done=${[...read.done].join(",")}`);

// clean up the test todo
let taskId;
for (const status of ["false", "true"]) {
	const list = await runDws([
		"todo",
		"+get-my-tasks",
		"--status",
		status,
		"--size",
		"20",
		"--role-types",
		"creator,executor,participant",
		"--format",
		"json",
	]);
	try {
		const parsed = JSON.parse(list.stdout);
		taskId = parsed.todos?.find((t) => String(t.subject).includes(dwsCard.code))?.taskId;
	} catch {
		/* ignore */
	}
	if (taskId) break;
}
if (taskId) {
	const ok = await deleteTodo(taskId);
	console.log("清理测试待办:", taskId, "→", ok ? "已删除" : "删除失败");
} else {
	console.log("没找到测试待办 taskId，跳过清理");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
