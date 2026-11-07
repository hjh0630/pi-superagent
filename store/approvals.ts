/**
 * Approval cards — the human gate in front of L3 actions.
 *
 * Rules of this module:
 *   - a card is written to the ledger *before* the action is blocked, so the
 *     trail exists even when nobody answers;
 *   - expiry means "not approved": a late answer is not an approval;
 *   - "always" is remembered with a scope, so the same question is never
 *     asked twice, but a different action still asks.
 */

import { createHash } from "node:crypto";
import { getDb, logEvent, nowIso } from "./db.ts";
import { loadRules } from "./catalog.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type ApprovalDecision = "allow_once" | "always" | "deny";

export interface Approval {
	id: string;
	/** Short code the human sees on the phone (used to match the todo title). */
	code: string;
	ticket_id: string | null;
	title: string;
	detail: string | null;
	level: string;
	scope: string | null;
	tool_name: string | null;
	args_json: string | null;
	args_hash: string | null;
	status: ApprovalStatus;
	channel: string | null;
	created_at: string;
	expires_at: string;
	decided_at: string | null;
	decided_by: string | null;
	decision: ApprovalDecision | null;
}

interface ApprovalRow {
	id: string;
	code: string;
	ticket_id: string | null;
	title: string;
	detail: string | null;
	level: string;
	scope: string | null;
	tool_name: string | null;
	args_json: string | null;
	args_hash: string | null;
	status: string;
	channel: string | null;
	created_at: string;
	expires_at: string;
	decided_at: string | null;
	decided_by: string | null;
	decision: string | null;
}

function id(prefix: string): string {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	return `${prefix}-${stamp}-${rand}`;
}

/** Four characters that are easy to read out loud on a phone. */
function shortCode(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let out = "";
	for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
	return out;
}

/**
 * How long a card stays open by default.
 *
 * Ten minutes was too short for a human who is not sitting at the terminal:
 * half of every wave's merge cards died unanswered, and the wave was blocked
 * for a reason nobody could act on. The number lives in rules.json.
 */
function defaultExpiryMinutes(): number {
	const configured = loadRules().approval?.expiresMinutes;
	return typeof configured === "number" && configured > 0 ? configured : 30;
}

/** The identity of one action: same tool + same arguments = same action. */
export function argsHash(toolName: string, args: unknown): string {
	return createHash("sha256")
		.update(`${toolName}:${JSON.stringify(args ?? {})}`)
		.digest("hex")
		.slice(0, 32);
}

export function createApproval(input: {
	title: string;
	detail?: string;
	level: string;
	scope?: string;
	toolName?: string;
	args?: unknown;
	ticketId?: string;
	channel?: string;
	expiresMinutes?: number;
}): Approval {
	const minutes = Math.max(1, Math.min(1440, input.expiresMinutes ?? defaultExpiryMinutes()));
	const now = nowIso();
	const approval: Approval = {
		id: id("ap"),
		code: shortCode(),
		ticket_id: input.ticketId ?? null,
		title: input.title,
		detail: input.detail ?? null,
		level: input.level,
		scope: input.scope ?? null,
		tool_name: input.toolName ?? null,
		args_json: input.args ? JSON.stringify(input.args) : null,
		args_hash: input.toolName ? argsHash(input.toolName, input.args) : null,
		status: "pending",
		channel: input.channel ?? null,
		created_at: now,
		expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
		decided_at: null,
		decided_by: null,
		decision: null,
	};
	getDb()
		.prepare(
			`INSERT INTO approvals (id, code, ticket_id, title, detail, level, scope, tool_name, args_json, args_hash,
				status, channel, created_at, expires_at, decided_at, decided_by, decision)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			approval.id,
			approval.code,
			approval.ticket_id,
			approval.title,
			approval.detail,
			approval.level,
			approval.scope,
			approval.tool_name,
			approval.args_json,
			approval.args_hash,
			approval.status,
			approval.channel,
			approval.created_at,
			approval.expires_at,
			null,
			null,
			null,
		);
	logEvent("approval.created", { level: approval.level, tool: approval.tool_name, scope: approval.scope }, approval.ticket_id ?? undefined);
	return approval;
}

export function getApproval(approvalId: string): Approval | undefined {
	const row = getDb().prepare("SELECT * FROM approvals WHERE id = ?").get(approvalId) as ApprovalRow | undefined;
	return row ? (row as unknown as Approval) : undefined;
}

/** The newest pending card for one action. */
export function findPendingByHash(hash: string): Approval | undefined {
	const row = getDb()
		.prepare("SELECT * FROM approvals WHERE args_hash = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1")
		.get(hash) as ApprovalRow | undefined;
	return row ? (row as unknown as Approval) : undefined;
}

/** The newest approved card for one action. */
export function findApprovedByHash(hash: string): Approval | undefined {
	const row = getDb()
		.prepare("SELECT * FROM approvals WHERE args_hash = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 1")
		.get(hash) as ApprovalRow | undefined;
	return row ? (row as unknown as Approval) : undefined;
}

export function listApprovals(limit = 20, status?: ApprovalStatus): Approval[] {
	const db = getDb();
	const rows = status
		? (db.prepare("SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT ?").all(status, limit) as unknown as ApprovalRow[])
		: (db.prepare("SELECT * FROM approvals ORDER BY created_at DESC LIMIT ?").all(limit) as unknown as ApprovalRow[]);
	return rows as unknown as Approval[];
}

export function pendingApprovals(): Approval[] {
	return listApprovals(50, "pending");
}

/**
 * Records the human's answer.
 * A card that already expired is not approved — expiry means "not released".
 */
export function decideApproval(
	approvalId: string,
	decision: ApprovalDecision,
	decidedBy = "human",
): { ok: boolean; approval?: Approval; reason?: string } {
	const approval = getApproval(approvalId);
	if (!approval) return { ok: false, reason: `No such approval: ${approvalId}` };
	if (approval.status !== "pending") {
		return { ok: false, approval, reason: `审批 ${approvalId} 已经是 ${approval.status}` };
	}
	if (Date.now() > Date.parse(approval.expires_at)) {
		getDb()
			.prepare("UPDATE approvals SET status = 'expired', decided_at = ?, decided_by = ?, decision = ? WHERE id = ?")
			.run(nowIso(), decidedBy, decision, approvalId);
		logEvent("approval.expired", { decision }, approval.ticket_id ?? undefined);
		return { ok: false, reason: `审批 ${approvalId} 已过期（${approval.expires_at.slice(11, 16)} 截止）——过期即未放行` };
	}
	const status: ApprovalStatus = decision === "deny" ? "rejected" : "approved";
	getDb()
		.prepare("UPDATE approvals SET status = ?, decided_at = ?, decided_by = ?, decision = ? WHERE id = ?")
		.run(status, nowIso(), decidedBy, decision, approvalId);
	logEvent("approval.decided", { decision, status }, approval.ticket_id ?? undefined);
	return { ok: true, approval: getApproval(approvalId) };
}

/** Cards nobody answered before their deadline. */
export function expireStaleApprovals(): string[] {
	const expired: string[] = [];
	for (const approval of pendingApprovals()) {
		if (Date.now() <= Date.parse(approval.expires_at)) continue;
		getDb()
			.prepare("UPDATE approvals SET status = 'expired', decided_at = ? WHERE id = ?")
			.run(nowIso(), approval.id);
		expired.push(approval.id);
	}
	return expired;
}

/**
 * Pushes a card's deadline back.
 *
 * A human may need more than the default window: the work behind the card is
 * already done, and the only thing missing is the yes. Extending is not
 * approving — the card still has to be answered.
 */
export function extendApproval(
	approvalId: string,
	minutes = 30,
): { ok: boolean; approval?: Approval; reason?: string } {
	const approval = getApproval(approvalId);
	if (!approval) return { ok: false, reason: `No such approval: ${approvalId}` };
	if (approval.status !== "pending") {
		return { ok: false, approval, reason: `审批 ${approvalId} 已经是 ${approval.status}（只有待批的卡能延期）` };
	}
	const from = Date.now() > Date.parse(approval.expires_at) ? Date.now() : Date.parse(approval.expires_at);
	const until = new Date(from + Math.max(1, Math.min(1440, minutes)) * 60_000).toISOString();
	getDb().prepare("UPDATE approvals SET expires_at = ? WHERE id = ?").run(until, approvalId);
	logEvent("approval.extended", { minutes, until }, approval.ticket_id ?? undefined);
	return { ok: true, approval: getApproval(approvalId) };
}

/** The card as the human reads it. */
export function approvalCard(approval: Approval): string {
	const lines = [
		`🔔 需要你批准 · ${approval.id}（${approval.code}）`,
		`级别：${approval.level} · ${approval.title}`,
	];
	if (approval.detail) lines.push(approval.detail);
	if (approval.tool_name) lines.push(`动作：${approval.tool_name}`);
	lines.push(
		"",
		"读命令时盯三处：路径（会碰哪个目录）· 改动（有没有删除/覆盖）· 外发（会不会推到远端）",
		`截止：${approval.expires_at.slice(0, 16).replace("T", " ")}（过期=未放行；过期不会补做，要继续请重跑）`,
		"",
		`放行一次：/super approve ${approval.id}`,
		`永久放行（限同范围）：/super approve ${approval.id} always`,
		`拒绝（这一次）：/super reject ${approval.id}`,
		`永久拒绝该范围：/super reject ${approval.id} always`,
	);
	return lines.join("\n");
}
