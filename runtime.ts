/**
 * Session wake-up channel.
 *
 * The outbox is the only delivery path: a background job never writes into the
 * transcript itself, it queues an outbox row and the runtime delivers it. If
 * no session is attached (pi restarted, extension reloaded, job finished while
 * pi was closed) the row stays pending and is delivered on the next start.
 *
 * Two channels, one rule:
 *   - stream (heartbeat, summary): shown, no model turn, zero tokens
 *   - decision (summary, alert): shown and starts a turn, because it needs an answer
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { markOutboxSent, pendingOutbox } from "./store/ledger.ts";

let runtime: ExtensionAPI | undefined;

/** Called by every extension at load time, so the newest runtime wins. */
export function bindRuntime(api: ExtensionAPI): void {
	runtime = api;
}

export function hasRuntime(): boolean {
	return runtime !== undefined;
}

/** Sends one custom message to the session. False when no runtime is attached. */
export function deliver(
	customType: string,
	text: string,
	opts: { triggerTurn?: boolean; details?: unknown } = {},
): boolean {
	if (!runtime) return false;
	try {
		runtime.sendMessage(
			{
				customType,
				content: [{ type: "text", text }],
				display: true,
				details: opts.details,
			},
			{ triggerTurn: opts.triggerTurn ?? false },
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Delivers every pending outbox row to the session.
 * Rows that cannot be delivered stay pending and are retried later.
 */
export function flushOutbox(): number {
	const items = pendingOutbox(20);
	let sent = 0;
	for (const item of items) {
		// Heartbeats are information, not questions: they must not cost a turn.
		const triggerTurn = item.kind === "summary" || item.kind === "alert";
		const ok = deliver(`superagent.${item.kind}`, item.payload, {
			triggerTurn,
			details: { outboxId: item.id, channel: item.channel },
		});
		if (!ok) break;
		markOutboxSent(item.id);
		sent++;
	}
	return sent;
}
