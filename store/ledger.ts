/**
 * Ledger operations over the superagent database.
 *
 * Everything the router, the workers and the human agree on lives here.
 * The write order is always: ledger first, then the external action.
 */

import { getDb, logEvent, nowIso, today, type Assignment, type AssignmentStatus, type OutboxItem, type Ticket, type TicketStatus } from "./db.ts";
import { recordSpend } from "./catalog.ts";
import { readJob } from "./jobs.ts";

function id(prefix: string): string {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	return `${prefix}-${stamp}-${rand}`;
}

export function createTicket(input: {
	title: string;
	intent?: string;
	acceptance?: string;
	budgetCents?: number;
	notes?: string;
}): Ticket {
	const ts = nowIso();
	const ticket: Ticket = {
		id: id("tk"),
		title: input.title,
		intent: input.intent ?? input.title,
		acceptance: input.acceptance ?? "",
		status: "queued",
		budget_cents: input.budgetCents ?? 0,
		created_at: ts,
		updated_at: ts,
		notes: input.notes,
	};
	getDb()
		.prepare(
			`INSERT INTO tickets (id, title, intent, acceptance, status, budget_cents, created_at, updated_at, notes)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			ticket.id,
			ticket.title,
			ticket.intent,
			ticket.acceptance,
			ticket.status,
			ticket.budget_cents,
			ticket.created_at,
			ticket.updated_at,
			ticket.notes ?? null,
		);
	logEvent("ticket.created", { title: ticket.title }, ticket.id);
	return ticket;
}

export function updateTicket(ticketId: string, status: TicketStatus, notes?: string): void {
	const db = getDb();
	if (notes !== undefined) {
		db.prepare("UPDATE tickets SET status = ?, updated_at = ?, notes = ? WHERE id = ?").run(status, nowIso(), notes, ticketId);
	} else {
		db.prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), ticketId);
	}
	logEvent("ticket.status", { status }, ticketId);
}

export function getTicket(ticketId: string): Ticket | undefined {
	return getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as Ticket | undefined;
}

export function listTickets(limit = 20): Ticket[] {
	return getDb()
		.prepare("SELECT * FROM tickets ORDER BY created_at DESC LIMIT ?")
		.all(limit) as unknown as Ticket[];
}

export function startAssignment(input: {
	ticketId?: string;
	provider: string;
	task: string;
	cwd: string;
	model?: string;
}): Assignment {
	const assignment: Assignment = {
		id: id("as"),
		ticket_id: input.ticketId ?? null,
		provider: input.provider,
		task: input.task,
		cwd: input.cwd,
		model: input.model,
		status: "running",
		exit_code: null,
		started_at: nowIso(),
	};
	getDb()
		.prepare(
			`INSERT INTO assignments (id, ticket_id, provider, task, cwd, model, status, exit_code, started_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			assignment.id,
			assignment.ticket_id,
			assignment.provider,
			assignment.task,
			assignment.cwd,
			assignment.model ?? null,
			assignment.status,
			null,
			assignment.started_at,
		);
	if (input.ticketId) updateTicket(input.ticketId, "running");
	logEvent("assignment.started", { provider: input.provider, cwd: input.cwd }, input.ticketId);
	return assignment;
}

export function finishAssignment(
	assignmentId: string,
	status: AssignmentStatus,
	exitCode: number | null,
	output: string,
	stderr: string,
	logPath?: string,
): void {
	const db = getDb();
	const row = db.prepare("SELECT started_at FROM assignments WHERE id = ?").get(assignmentId) as { started_at: string } | undefined;
	const duration = row ? Date.parse(nowIso()) - Date.parse(row.started_at) : 0;
	db.prepare(
		`UPDATE assignments SET status = ?, exit_code = ?, ended_at = ?, duration_ms = ?, output = ?, stderr = ?, log_path = ? WHERE id = ?`,
	).run(status, exitCode, nowIso(), duration, output.slice(0, 8000), stderr.slice(0, 4000), logPath ?? null, assignmentId);
	const assignment = db.prepare("SELECT provider, ticket_id FROM assignments WHERE id = ?").get(assignmentId) as
		| { provider: string; ticket_id: string | null }
		| undefined;
	if (assignment) {
		recordSpend(assignment.provider, duration / 1000);
		if (assignment.ticket_id) {
			const ticketStatus: TicketStatus =
				status === "succeeded" ? "done" : status === "running" ? "running" : status === "cancelled" ? "cancelled" : "failed";
			updateTicket(assignment.ticket_id, ticketStatus);
		}
	}
	logEvent("assignment.finished", { status, exitCode }, assignment?.ticket_id ?? undefined);
}

export function addReport(input: {
	ticketId?: string;
	assignmentId?: string;
	status: "ready" | "waiting" | "blocked" | "failed";
	evidence?: unknown;
	impact?: string;
}): string {
	const reportId = id("rp");
	getDb()
		.prepare(
			`INSERT INTO reports (id, ticket_id, assignment_id, status, evidence, impact, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			reportId,
			input.ticketId ?? null,
			input.assignmentId ?? null,
			input.status,
			JSON.stringify(input.evidence ?? {}),
			input.impact ?? "",
			nowIso(),
		);
	logEvent("report.added", { status: input.status }, input.ticketId);
	return reportId;
}

/**
 * Queues a message for the session.
 *
 * A heartbeat is a snapshot of the ledger at one moment. Delivering an old
 * one is worse than delivering none: it states "在跑 3" about jobs that
 * finished long ago, and the reader has no way to tell it is stale. So a
 * heartbeat queued more than HEARTBEAT_MAX_AGE_MS ago is dropped instead of
 * being delivered, and a newer heartbeat always replaces an older pending one
 * (the newest snapshot is the only one worth showing).
 */
export const HEARTBEAT_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * An alert older than this is history, not news.
 *
 * A card that needed an answer stops needing one when it expires, and a
 * "something is stuck" warning about a job that finished hours ago is just
 * noise. Delivering these late (a session that was asleep collects them all
 * at once) was the single loudest defect in the whole system.
 */
export const ALERT_MAX_AGE_MS = 30 * 60 * 1000;

/** A completion report older than this is no longer news either. */
export const SUMMARY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function enqueueOutbox(channel: string, kind: OutboxItem["kind"], payload: string): number {
	const db = getDb();
	if (kind === "heartbeat") {
		// A newer heartbeat makes an older pending one redundant.
		db.prepare("DELETE FROM outbox WHERE kind = 'heartbeat' AND status = 'pending'").run();
	}
	const result = db
		.prepare("INSERT INTO outbox (ts, channel, kind, payload, status, attempts) VALUES (?, ?, ?, ?, 'pending', 0)")
		.run(nowIso(), channel, kind, payload);
	return Number(result.lastInsertRowid);
}

/**
 * The pending rows worth delivering.
 *
 * Heartbeats that went stale while no session was attached are dropped, not
 * delivered: they would report the state of jobs that are long finished.
 * Alerts and summaries are age-capped for the same reason — what a card or
 * a job report meant an hour ago is not what it means now.
 */
export function pendingOutbox(limit = 20): OutboxItem[] {
	const db = getDb();
	const now = Date.now();
	const rows = db
		.prepare("SELECT * FROM outbox WHERE status = 'pending' ORDER BY id LIMIT ?")
		.all(limit) as unknown as OutboxItem[];
	const fresh: OutboxItem[] = [];
	for (const row of rows) {
		const age = now - Date.parse(row.ts);
		const maxAge =
			row.kind === "heartbeat" ? HEARTBEAT_MAX_AGE_MS : row.kind === "alert" ? ALERT_MAX_AGE_MS : SUMMARY_MAX_AGE_MS;
		if (age > maxAge) {
			db.prepare("UPDATE outbox SET status = 'stale' WHERE id = ?").run(row.id);
			continue;
		}
		fresh.push(row);
	}
	return fresh;
}

export function markOutboxSent(id: number): void {
	getDb().prepare("UPDATE outbox SET status = 'sent', sent_at = ? WHERE id = ?").run(nowIso(), id);
}

export function addDecision(input: { kind: "decided" | "rejected"; scope?: string; text: string; source?: string }): string {
	const decisionId = id("dc");
	getDb()
		.prepare("INSERT INTO decisions (id, kind, scope, text, source, decided_at) VALUES (?, ?, ?, ?, ?, ?)")
		.run(decisionId, input.kind, input.scope ?? null, input.text, input.source ?? "human", nowIso());
	logEvent("decision.added", { kind: input.kind, scope: input.scope });
	return decisionId;
}

export function listDecisions(limit = 20): { id: string; kind: string; scope: string | null; text: string; decided_at: string }[] {
	return getDb()
		.prepare("SELECT id, kind, scope, text, decided_at FROM decisions ORDER BY decided_at DESC LIMIT ?")
		.all(limit) as never;
}

/**
 * The last answer the human gave for one scope.
 * This is the memory that keeps the agent from asking the same question twice.
 */
export function findDecisionByScope(scope: string): { kind: string; text: string; scope: string; decided_at: string } | undefined {
	const row = getDb()
		.prepare("SELECT kind, text, scope, decided_at FROM decisions WHERE scope = ? ORDER BY decided_at DESC LIMIT 1")
		.get(scope) as { kind: string; text: string; scope: string; decided_at: string } | undefined;
	return row;
}

/* ------------------------------------------------------------------ plans */

export type PlanStatus = "draft" | "awaiting_approval" | "approved" | "rejected" | "running" | "done" | "failed";

export interface PlanStep {
	id: string;
	title: string;
	task: string;
	/** Steps that must finish before this one starts (ids of other steps). */
	dependsOn?: string[];
	/** Named role (design, frontend, seo, social...). Wins over provider/tag. */
	role?: string;
	/** Explicit executor; when absent the router picks one from the capability tag. */
	provider?: string;
	/** Capability tag used for routing (code, review, research, general...). */
	tag?: string;
	acceptance?: string;
	budgetCents?: number;
	/** Job that executes this step. */
	jobId?: string;
	status?: "pending" | "dispatched" | "done" | "failed";
}

export interface Plan {
	id: string;
	title: string;
	window_start: string;
	window_end: string;
	summary: string;
	steps: PlanStep[];
	status: PlanStatus;
	ticket_id: string | null;
	created_at: string;
	decided_at?: string;
	decided_by?: string;
}

interface PlanRow {
	id: string;
	title: string | null;
	window_start: string;
	window_end: string;
	summary: string | null;
	steps: string | null;
	status: string;
	ticket_id: string | null;
	created_at: string | null;
	decided_at: string | null;
	decided_by: string | null;
}

function rowToPlan(row: PlanRow): Plan {
	let steps: PlanStep[] = [];
	try {
		steps = row.steps ? (JSON.parse(row.steps) as PlanStep[]) : [];
	} catch {
		steps = [];
	}
	return {
		id: row.id,
		title: row.title ?? row.id,
		window_start: row.window_start,
		window_end: row.window_end,
		summary: row.summary ?? "",
		steps,
		status: row.status as PlanStatus,
		ticket_id: row.ticket_id,
		created_at: row.created_at ?? row.window_start,
		decided_at: row.decided_at ?? undefined,
		decided_by: row.decided_by ?? undefined,
	};
}

/**
 * A 12-hour plan window: a batch of steps with budget and acceptance that a
 * human approves before anything runs. A plan is not a paragraph — it is a
 * list of assignments waiting for permission.
 */
export function createPlan(input: {
	title: string;
	summary?: string;
	windowHours?: number;
	steps: PlanStep[];
	ticketId?: string;
}): Plan {
	const ts = nowIso();
	const hours = Math.max(1, Math.min(48, input.windowHours ?? 12));
	const end = new Date(Date.now() + hours * 3_600_000).toISOString();
	const plan: Plan = {
		id: id("pl"),
		title: input.title,
		window_start: ts,
		window_end: end,
		summary: input.summary ?? "",
		steps: input.steps.map((step, index) => ({ ...step, id: step.id || `s${index + 1}`, status: "pending" })),
		status: "awaiting_approval",
		ticket_id: input.ticketId ?? null,
		created_at: ts,
	};
	getDb()
		.prepare(
			`INSERT INTO plans (id, title, window_start, window_end, summary, steps, status, ticket_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			plan.id,
			plan.title,
			plan.window_start,
			plan.window_end,
			plan.summary,
			JSON.stringify(plan.steps),
			plan.status,
			plan.ticket_id,
			plan.created_at,
		);
	logEvent("plan.created", { title: plan.title, steps: plan.steps.length }, plan.ticket_id ?? undefined);
	return plan;
}

export function getPlan(planId: string): Plan | undefined {
	const row = getDb().prepare("SELECT * FROM plans WHERE id = ?").get(planId) as PlanRow | undefined;
	return row ? rowToPlan(row) : undefined;
}

export function listPlans(limit = 20): Plan[] {
	const rows = getDb().prepare("SELECT * FROM plans ORDER BY created_at DESC LIMIT ?").all(limit) as unknown as PlanRow[];
	return rows.map(rowToPlan);
}

export function setPlanStatus(planId: string, status: PlanStatus, decidedBy?: string): Plan | undefined {
	const db = getDb();
	if (decidedBy) {
		// The decision trail is written once and never overwritten.
		db.prepare("UPDATE plans SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?").run(
			status,
			nowIso(),
			decidedBy,
			planId,
		);
	} else {
		db.prepare("UPDATE plans SET status = ? WHERE id = ?").run(status, planId);
	}
	logEvent("plan.status", { status, decidedBy }, undefined);
	return getPlan(planId);
}

export function updatePlanSteps(planId: string, steps: PlanStep[]): void {
	getDb().prepare("UPDATE plans SET steps = ? WHERE id = ?").run(JSON.stringify(steps), planId);
}

/** The human said yes. */
export function approvePlan(planId: string, decidedBy = "human"): Plan | undefined {
	return setPlanStatus(planId, "approved", decidedBy);
}

/** The human said no. */
export function rejectPlan(planId: string, decidedBy = "human"): Plan | undefined {
	return setPlanStatus(planId, "rejected", decidedBy);
}

/**
 * Closes a plan once every step's job reached a terminal state.
 * Called when a job finishes so the plan does not stay "running" forever.
 */
export function planProgress(planId: string): { done: number; total: number; finished: boolean } {
	const plan = getPlan(planId);
	if (!plan) return { done: 0, total: 0, finished: true };
	let done = 0;
	let changed = false;
	for (const step of plan.steps) {
		if (!step.jobId) continue;
		const job = readJob(step.jobId);
		if (!job) continue;
		const terminal =
			job.status === "succeeded" ||
			job.status === "failed" ||
			job.status === "timeout" ||
			job.status === "cancelled" ||
			job.status === "orphaned";
		if (!terminal) continue;
		done++;
		const nextStatus = job.status === "succeeded" ? "done" : "failed";
		if (step.status !== nextStatus) {
			step.status = nextStatus;
			changed = true;
		}
	}
	if (changed) updatePlanSteps(planId, plan.steps);
	const total = plan.steps.filter((s) => s.jobId).length;
	const finished = total > 0 && done === total;
	if (finished && plan.status === "running") setPlanStatus(planId, "done");
	return { done, total, finished };
}

/**
 * The hourly heartbeat: a template snapshot of the ledger.
 * No model call, so a snapshot an hour costs nothing.
 */
export function heartbeatSnapshot(windowMinutes = 60): string {
	const db = getDb();
	const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

	const done = db
		.prepare("SELECT provider, title FROM assignments a LEFT JOIN tickets t ON t.id = a.ticket_id WHERE a.status = 'succeeded' AND a.ended_at >= ?")
		.all(since) as { provider: string; title: string | null }[];
	const failed = db
		.prepare("SELECT provider, title FROM assignments a LEFT JOIN tickets t ON t.id = a.ticket_id WHERE a.status IN ('failed','timeout') AND a.ended_at >= ?")
		.all(since) as { provider: string; title: string | null }[];
	const running = db
		.prepare("SELECT provider, task, cwd FROM assignments WHERE status = 'running'")
		.all() as { provider: string; task: string; cwd: string }[];
	const needsHuman = db
		.prepare("SELECT id, title FROM tickets WHERE status IN ('waiting_approval','blocked')")
		.all() as { id: string; title: string }[];
	const pending = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'queued'").get() as { n: number };

	const lines: string[] = [];
	lines.push(`⏱ 心跳 · ${nowIso().slice(11, 16)} · 过去 ${windowMinutes} 分钟`);
	lines.push(`完成 ${done.length}｜失败 ${failed.length}｜在跑 ${running.length}｜待办 ${pending.n}｜需你 ${needsHuman.length}`);
	if (done.length) {
		lines.push("— 完成 —");
		for (const d of done.slice(0, 5)) lines.push(`  ✅ ${d.provider}  ${(d.title ?? "").slice(0, 60)}`);
	}
	if (failed.length) {
		lines.push("— 失败 —");
		for (const f of failed.slice(0, 5)) lines.push(`  ❌ ${f.provider}  ${(f.title ?? "").slice(0, 60)}`);
	}
	if (running.length) {
		lines.push("— 在跑 —");
		for (const r of running.slice(0, 5)) lines.push(`  🔄 ${r.provider}  ${r.task.slice(0, 60)}`);
	}
	if (needsHuman.length) {
		lines.push("— 需要你 —");
		for (const t of needsHuman.slice(0, 5)) lines.push(`  🔔 ${t.id}  ${t.title.slice(0, 60)}`);
	}
	return lines.join("\n");
}
