/**
 * The Panel and the Watchdog.
 *
 * Panel   — the three questions a human actually asks:
 *           "现在需要我吗" / "系统健康吗" / "这件事的历史"
 * Watchdog — judges real progress, not "is the process still alive".
 *           A job that is running but has not moved for 15 minutes is stuck,
 *           no matter how healthy the process looks.
 */

import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDb, nowIso, today } from "./db.ts";
import { listApprovals, pendingApprovals } from "./approvals.ts";
import { listPlans } from "./ledger.ts";
import { budgetFor, providerHealth } from "./catalog.ts";
import { providers } from "../providers/registry.ts";
import { allJobs } from "./jobs.ts";
import type { VerificationStep } from "./pipeline.ts";

export interface Panel {
	at: string;
	/** Things only a human can unblock. */
	needsHuman: { kind: string; id: string; label: string; since: string }[];
	/** Work in flight. */
	running: { kind: string; id: string; label: string; provider: string; startedAt: string; minutes: number }[];
	/** Finished in the last 24 hours. */
	done: { provider: string; label: string; at: string }[];
	/** Money and time spent today. */
	spend: { provider: string; calls: number; maxCalls: number; minutes: number; maxMinutes: number }[];
}

export function panel(): Panel {
	const db = getDb();
	const since = new Date(Date.now() - 24 * 3_600_000).toISOString();

	const needsHuman: Panel["needsHuman"] = [];
	for (const approval of pendingApprovals()) {
		needsHuman.push({ kind: "approval", id: approval.id, label: approval.title, since: approval.created_at });
	}
	for (const plan of listPlans(20)) {
		if (plan.status === "awaiting_approval") {
			needsHuman.push({ kind: "plan", id: plan.id, label: plan.title, since: plan.created_at });
		}
	}
	const blockedTickets = db
		.prepare("SELECT id, title, created_at FROM tickets WHERE status IN ('waiting_approval','blocked')")
		.all() as { id: string; title: string; created_at: string }[];
	for (const ticket of blockedTickets) {
		needsHuman.push({ kind: "ticket", id: ticket.id, label: ticket.title, since: ticket.created_at });
	}

	const runningAssignments = db
		.prepare("SELECT id, provider, task, started_at FROM assignments WHERE status = 'running'")
		.all() as { id: string; provider: string; task: string; started_at: string }[];
	const running: Panel["running"] = runningAssignments.map((a) => ({
		kind: "assignment",
		id: a.id,
		label: a.task,
		provider: a.provider,
		startedAt: a.started_at,
		minutes: Math.round((Date.now() - Date.parse(a.started_at)) / 60_000),
	}));
	for (const job of allJobs()) {
		if (job.status !== "queued" && job.status !== "running") continue;
		running.push({
			kind: "job",
			id: job.id,
			label: job.task,
			provider: job.provider,
			startedAt: job.startedAt,
			minutes: Math.round((Date.now() - Date.parse(job.startedAt)) / 60_000),
		});
	}

	const doneRows = db
		.prepare("SELECT provider, task, ended_at FROM assignments WHERE status = 'succeeded' AND ended_at >= ? ORDER BY ended_at DESC LIMIT 20")
		.all(since) as { provider: string; task: string; ended_at: string }[];

	const spend = providers.map((p) => {
		const state = budgetFor(p.id);
		return {
			provider: p.id,
			calls: state.calls,
			maxCalls: state.maxCalls,
			minutes: Math.round(state.seconds / 60),
			maxMinutes: state.maxMinutes,
		};
	});

	return {
		at: nowIso(),
		needsHuman,
		running,
		done: doneRows.map((r) => ({ provider: r.provider, label: r.task, at: r.ended_at })),
		spend,
	};
}

/* --------------------------------------------------------------- watchdog */

export interface WatchdogVerdict {
	at: string;
	ok: boolean;
	/** In flight but nothing has happened for a while — real stuck, not busy. */
	stuck: { id: string; kind: string; label: string; provider: string; idleMinutes: number }[];
	/** Waiting for a human longer than the expiry. */
	expired: string[];
	/** Cards still open. */
	pending: number;
	/** One line for the human. */
	summary: string;
}

/** Minutes without movement after which a running thing counts as stuck. */
export const STUCK_MINUTES = 15;

/**
 * Judges progress. A job is "alive" when something happened to it recently:
 * an event, a job record change, or a heartbeat.
 */
export function watchdog(stuckMinutes = STUCK_MINUTES, justExpired: string[] = []): WatchdogVerdict {
	const db = getDb();
	const cutoff = Date.now() - stuckMinutes * 60_000;
	const stuck: WatchdogVerdict["stuck"] = [];

	const running = db
		.prepare("SELECT id, provider, task, started_at FROM assignments WHERE status = 'running'")
		.all() as { id: string; provider: string; task: string; started_at: string }[];
	for (const assignment of running) {
		const lastEvent = db
			.prepare("SELECT ts FROM events WHERE ticket_id IS NOT NULL ORDER BY ts DESC LIMIT 1")
			.get() as { ts: string } | undefined;
		const job = allJobs().find((j) => j.provider === assignment.provider && j.startedAt === assignment.started_at);
		const lastMove = job?.endedAt ?? lastEvent?.ts ?? assignment.started_at;
		const idleMinutes = Math.round((Date.now() - Date.parse(lastMove)) / 60_000);
		if (Date.parse(lastMove) < cutoff) {
			stuck.push({ id: assignment.id, kind: "assignment", label: assignment.task, provider: assignment.provider, idleMinutes });
		}
	}

	// Only cards that just ran out count as "waiting for a human": once they are
	// marked expired they are history, not a pending request.
	const expired = justExpired.length
		? justExpired
		: pendingApprovals()
				.filter((a) => Date.parse(a.expires_at) < Date.now())
				.map((a) => a.id);

	const pending = pendingApprovals().length;
	const health = providers.map((p) => ({ id: p.id, ...providerHealth(p.id) }));

	const summary = stuck.length
		? `${stuck.length} 个任务疑似卡住（>${stuckMinutes} 分钟没动静）`
		: expired.length
			? `${expired.length} 张审批卡过期未处理`
			: pending
				? `进展正常｜${pending} 张卡在等人`
				: "进展正常｜没有待办、没有卡在等人的事";

	return {
		at: nowIso(),
		ok: stuck.length === 0 && expired.length === 0,
		stuck,
		expired,
		pending,
		summary,
	};
}

/* ------------------------------------------------------------ stale runs */

/**
 * A verification run that was interrupted (session died) stays "running" for
 * ever unless somebody closes it. A run older than 30 minutes with no new
 * steps is closed as "abandoned" — it must not look like work in progress.
 */
export function closeStaleRuns(maxAgeMinutes = 30): string[] {
	const db = getDb();
	const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();
	const rows = db
		.prepare("SELECT id, steps, created_at FROM verifications WHERE status = 'running' AND created_at < ?")
		.all(cutoff) as { id: string; steps: string | null; created_at: string }[];
	const closed: string[] = [];
	for (const row of rows) {
		let steps: VerificationStep[] = [];
		try {
			steps = row.steps ? (JSON.parse(row.steps) as VerificationStep[]) : [];
		} catch {
			steps = [];
		}
		const inFlight = steps.some((s) => s.status === "running" || s.status === "pending");
		for (const step of steps) {
			if (step.status === "running" || step.status === "pending") {
				step.status = step.status === "running" ? "failed" : "skipped";
				step.rounds.push({
					action: "会话中断，未完成",
					evidence: { reason: "verification run was interrupted", at: row.created_at },
					ok: false,
				});
			}
		}
		db.prepare("UPDATE verifications SET status = ?, steps = ?, ended_at = ? WHERE id = ?").run(
			inFlight ? "failed" : "done",
			JSON.stringify(steps),
			new Date().toISOString(),
			row.id,
		);
		closed.push(row.id);
	}
	return closed;
}

/* ------------------------------------------------------------ resume note */

/**
 * Closes ledger assignments whose job is already over.
 * The watchdog closes the job file; without this the ledger keeps showing
 * "running" rows for work that died with its process.
 */
export function closeStaleAssignments(maxAgeMinutes = 30): string[] {
	const db = getDb();
	const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();
	const rows = db
		.prepare("SELECT id, provider, task, started_at FROM assignments WHERE status = 'running' AND started_at < ?")
		.all(cutoff) as { id: string; provider: string; task: string; started_at: string }[];
	const closed: string[] = [];
	for (const row of rows) {
		const job = allJobs().find((j) => j.provider === row.provider && j.startedAt === row.started_at);
		const jobOver = !job || ["succeeded", "failed", "timeout", "cancelled", "orphaned"].includes(job.status);
		if (!jobOver) continue;
		db.prepare("UPDATE assignments SET status = 'failed', ended_at = ?, exit_code = -1, stderr = ? WHERE id = ?").run(
			new Date().toISOString(),
			"closed by watchdog: the provider process is gone",
			row.id,
		);
		closed.push(row.id);
	}
	return closed;
}

export interface ResumeNote {
	at: string;
	verdict: WatchdogVerdict;
	panel: Panel;
	/** What the next session should do first. */
	next: string[];
}

/**
 * The recovery note: written on every start so a restarted session knows
 * where it left off without replaying the whole transcript.
 */
export function writeResumeNote(): ResumeNote {
	const verdict = watchdog();
	const snapshot = panel();
	const next: string[] = [];
	for (const item of snapshot.needsHuman) next.push(`等人：${item.kind} ${item.id} · ${item.label.slice(0, 60)}`);
	for (const item of verdict.stuck) next.push(`卡住：${item.id}（${item.provider}）${item.idleMinutes} 分钟没动静`);
	for (const item of snapshot.running) next.push(`在跑：${item.provider} ${item.label.slice(0, 50)}`);
	if (!next.length) next.push("没有在途的工作，可以开新工单。");

	const note: ResumeNote = { at: verdict.at, verdict, panel: snapshot, next };
	const path = resumeNotePath();
	const lines = [
		`# 恢复便签 ${verdict.at}`,
		"",
		verdict.summary,
		"",
		"## 下一步",
		...next.map((n) => `- ${n}`),
		"",
		"## 今日花费",
		...snapshot.spend.map((s) => `- ${s.provider} ${s.calls}/${s.maxCalls} 次 · ${s.minutes}/${s.maxMinutes} 分钟`),
	];
	writeFileSync(path, lines.join("\n"), "utf8");
	return note;
}

export function resumeNotePath(): string {
	return join(AGENT_HOME, "superagent", "resume.md");
}

/** The Panel as the human reads it. */
export function formatPanel(p: Panel): string {
	const lines = [
		`📊 Panel · ${p.at.slice(0, 16).replace("T", " ")}`,
		"",
		`需要你（${p.needsHuman.length}）`,
		...p.needsHuman.slice(0, 6).map((i) => `  🔔 ${i.kind} ${i.id}  ${i.label.slice(0, 56)}`),
		"",
		`在跑（${p.running.length}）`,
		...p.running.slice(0, 6).map((i) => `  🔄 ${i.provider} ${i.minutes}min  ${i.label.slice(0, 56)}`),
		"",
		`完成（过去 24h：${p.done.length}）`,
		...p.done.slice(0, 6).map((i) => `  ✅ ${i.provider}  ${i.label.slice(0, 56)}`),
		"",
		"今日花费",
		...p.spend.map((s) => `  💰 ${s.provider.padEnd(8)} ${s.calls}/${s.maxCalls} 次 · ${s.minutes}/${s.maxMinutes} 分钟`),
	];
	return lines.join("\n");
}
