/**
 * The Watchdog, standalone.
 *
 * Runs outside pi: judges real progress, writes the recovery note and puts
 * one message in the outbox when a human is needed. Meant to be run by a
 * scheduler so a dead session is noticed even when nobody is looking at the
 * terminal.
 *
 * Exit codes: 0 healthy · 1 something is stuck · 2 a human is needed.
 *
 * Usage: node tools/watchdog.mjs [--json]
 *        node tools/watchdog.mjs --start-run 360 --goal "真实访客 > 0"
 *        node tools/watchdog.mjs --end-run
 */

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { watchdog, writeResumeNote, formatPanel, closeStaleRuns, closeStaleAssignments } from "../store/panel.ts";
import { enqueueOutbox, heartbeatSnapshot } from "../store/ledger.ts";
import { expireStaleApprovals, extendApproval, pendingApprovals } from "../store/approvals.ts";
import { reconcileOrphanedJobs } from "../store/runner.ts";
import { readRunWindow, writeRunWindow, clearRunWindow } from "../store/runwindow.ts";
import { loadHits, visitorReport } from "./visitors.mjs";
import { LEDGER_DIR, LIVE_URL_FILE } from "./paths.mjs";

const asJson = process.argv.includes("--json");
const argv = process.argv.slice(2);
const flag = (name) => {
	const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
	if (i < 0) return undefined;
	const arg = argv[i];
	if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
	return argv[i + 1];
};

/* ------------------------------------------------------------ run window */

if (argv.includes("--start-run")) {
	const minutes = Number(flag("start-run") ?? 360);
	const goal = flag("goal") ?? "（未写目标）";
	const window = writeRunWindow({ goal, target: flag("target"), minutes });
	console.log(`run window open until ${window.until} — ${goal}`);
	process.exit(0);
}
if (argv.includes("--end-run")) {
	clearRunWindow();
	console.log("run window closed");
	process.exit(0);
}

const window = readRunWindow();

/* ----------------------------------------------------------------- state */

// A provider process that is gone cannot come back with a result.
const orphans = reconcileOrphanedJobs();
const staleAssignments = closeStaleAssignments();
const staleRuns = closeStaleRuns();
const expired = expireStaleApprovals();

/**
 * A card whose deadline is close, whose work is still running, gets more
 * time. The card is not approved by this — it still needs a yes. But a human
 * who was not at the terminal for a few minutes should not find the work
 * already dead when they come back.
 */
const extended = [];
if (window) {
	for (const card of pendingApprovals()) {
		const leftMs = Date.parse(card.expires_at) - Date.now();
		if (leftMs > 15 * 60_000) continue;
		const result = extendApproval(card.id, 30);
		if (result.ok) extended.push(card.id);
	}
}

const verdict = watchdog(undefined, expired);
const note = writeResumeNote();

if (verdict.stuck.length || verdict.expired.length) {
	enqueueOutbox(
		"stream",
		"alert",
		`🐕 Watchdog：${verdict.summary}\n` +
			[...verdict.stuck.map((s) => `  🐌 ${s.id}（${s.provider}）${s.idleMinutes} 分钟没动静`), ...verdict.expired.map((id) => `  ⌛ 过期 ${id}`)].join("\n"),
	);
}

const logDir = LEDGER_DIR;
writeFileSync(
	join(logDir, "watchdog.json"),
	JSON.stringify({ verdict, expired: expired.length, orphans, staleRuns, staleAssignments, window, extended }, null, 2),
	"utf8",
);

/* ---------------------------------------------------------- the hourly pulse */

/**
 * The pulse exists to say something. It says it when a run window is open,
 * or when there is work in flight, or when a human is needed. When nothing
 * is happening it stays quiet — an hourly "all fine" is not information.
 */
const running = note.panel.running.length > 0;
const busy = running || verdict.pending > 0 || extended.length > 0;

if (!asJson && (window || busy)) {
	const lines = [heartbeatSnapshot(60)];
	let liveUrl = "";
	try {
		liveUrl = readFileSync(LIVE_URL_FILE, "utf8").trim();
	} catch {
		liveUrl = "";
	}
	if (liveUrl) lines.push(`🌐 公网地址：${liveUrl}`);
	if (window) {
		const visitors = visitorReport(loadHits(), window.started_at);
		const minutesLeft = Math.max(0, Math.round((Date.parse(window.until) - Date.now()) / 60_000));
		const hoursLeft = `${Math.floor(minutesLeft / 60)}h${String(minutesLeft % 60).padStart(2, "0")}m`;
		lines.unshift(
			`🎯 目标：${window.goal}${window.target ? `（${window.target}）` : ""} · 剩余 ${hoursLeft}`,
			`👥 真实访客：累计 ${visitors.visitors}（独立 IP ${visitors.uniqueIps}）· 本机自检 ${visitors.selfChecks} · 工具探针 ${visitors.probes}`,
		);
	}
	if (extended.length) lines.push(`⏳ 延期了 ${extended.length} 张卡：${extended.join(", ")}`);
	enqueueOutbox("stream", "heartbeat", lines.join("\n"));
}

if (asJson) {
	console.log(JSON.stringify({ ...verdict, window, extended }, null, 2));
} else {
	console.log(formatPanel(note.panel));
	console.log("");
	console.log(verdict.summary);
}

process.exit(verdict.stuck.length ? 1 : verdict.pending ? 2 : 0);
