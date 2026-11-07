/**
 * Draft cards.
 *
 * Grok Bot's rule that matters most: the agent may prepare anything, but
 * "the person who presses Send is you". A draft is the L1 artefact; sending it
 * is an L3 action that goes through an approval card.
 *
 * The five elements (五要素) are the contract of a draft:
 *   结果 / 来源 / 约束 / 交付物 / 停下来等我的节点
 */

import { getDb, logEvent, nowIso } from "./db.ts";

export type DraftStatus = "draft" | "approved" | "sent" | "discarded";

export interface Draft {
	id: string;
	ticket_id: string | null;
	title: string;
	/** Who it is for: a person, a channel, a repo... */
	target: string;
	/** Where the facts come from. */
	source?: string;
	/** What must not happen. */
	constraints?: string;
	/** What the reader gets. */
	deliverable?: string;
	/** Where it must stop and wait. */
	stop_at?: string;
	/** The drafted text itself. */
	content?: string;
	status: DraftStatus;
	approval_id?: string;
	created_at: string;
	updated_at: string;
}

interface DraftRow {
	id: string;
	ticket_id: string | null;
	title: string;
	target: string;
	source: string | null;
	constraints: string | null;
	deliverable: string | null;
	stop_at: string | null;
	content: string | null;
	status: string;
	approval_id: string | null;
	created_at: string;
	updated_at: string;
}

function id(prefix: string): string {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	return `${prefix}-${stamp}-${rand}`;
}

export function createDraft(input: {
	title: string;
	target: string;
	source?: string;
	constraints?: string;
	deliverable?: string;
	stopAt?: string;
	content?: string;
	ticketId?: string;
}): Draft {
	const ts = nowIso();
	const draft: Draft = {
		id: id("df"),
		ticket_id: input.ticketId ?? null,
		title: input.title,
		target: input.target,
		source: input.source,
		constraints: input.constraints,
		deliverable: input.deliverable,
		stop_at: input.stopAt,
		content: input.content,
		status: "draft",
		created_at: ts,
		updated_at: ts,
	};
	getDb()
		.prepare(
			`INSERT INTO drafts (id, ticket_id, title, target, source, constraints, deliverable, stop_at, content, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
		)
		.run(
			draft.id,
			draft.ticket_id,
			draft.title,
			draft.target,
			draft.source ?? null,
			draft.constraints ?? null,
			draft.deliverable ?? null,
			draft.stop_at ?? null,
			draft.content ?? null,
			ts,
			ts,
		);
	logEvent("draft.created", { title: draft.title, target: draft.target }, draft.ticket_id ?? undefined);
	return draft;
}

export function getDraft(draftId: string): Draft | undefined {
	const row = getDb().prepare("SELECT * FROM drafts WHERE id = ?").get(draftId) as DraftRow | undefined;
	return row ? (row as unknown as Draft) : undefined;
}

export function listDrafts(limit = 20): Draft[] {
	const rows = getDb().prepare("SELECT * FROM drafts ORDER BY created_at DESC LIMIT ?").all(limit) as unknown as DraftRow[];
	return rows as unknown as Draft[];
}

export function setDraftStatus(draftId: string, status: DraftStatus, approvalId?: string): Draft | undefined {
	const db = getDb();
	if (approvalId) {
		db.prepare("UPDATE drafts SET status = ?, approval_id = ?, updated_at = ? WHERE id = ?").run(status, approvalId, nowIso(), draftId);
	} else {
		db.prepare("UPDATE drafts SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), draftId);
	}
	logEvent("draft.status", { status }, undefined);
	return getDraft(draftId);
}

/** The draft card the human reads. */
export function draftCard(draft: Draft): string {
	const lines = [
		`📝 草稿 ${draft.id} · ${draft.title}`,
		`目标：${draft.target}`,
	];
	if (draft.source) lines.push(`来源：${draft.source}`);
	if (draft.constraints) lines.push(`约束：${draft.constraints}`);
	if (draft.deliverable) lines.push(`交付物：${draft.deliverable}`);
	if (draft.stop_at) lines.push(`停在：${draft.stop_at}`);
	if (draft.content) {
		lines.push("", "— 草稿正文 —", draft.content.slice(0, 2000));
	}
	lines.push(
		"",
		`发送（要人点头）：/super send ${draft.id}`,
		`丢弃：/super discard ${draft.id}`,
	);
	return lines.join("\n");
}
