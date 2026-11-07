/**
 * The dispatch engine.
 *
 * One place turns "a task for another model" into "a job with evidence":
 *   budget gate -> idempotency -> ledger write -> run -> ledger write -> outbox
 *
 * The write order is always ledger first, then the external action: a crash
 * must leave a record, never a mystery.
 */

import { existsSync } from "node:fs";
import { getProvider, providers } from "../providers/registry.ts";
import type { ProviderSpec } from "../providers/types.ts";
import { DEFAULT_TIMEOUT_MS, runProvider, truncate } from "../providers/run.ts";
import { dispatchKeyFor, findJobByDispatchKey, newJobId, openJobs, patchJob, writeJob, writeJobLog, type FleetJob } from "./jobs.ts";
import {
	addReport,
	enqueueOutbox,
	finishAssignment,
	heartbeatSnapshot,
	planProgress,
	startAssignment,
} from "./ledger.ts";
import { withinBudget } from "./catalog.ts";
import { flushOutbox } from "../runtime.ts";

/** A finished job with the same key is reused for a day. */
const DEDUPE_TTL_MS = 24 * 3_600_000;

export interface DispatchInput {
	provider: string;
	task: string;
	cwd: string;
	model?: string;
	maxTurns?: number;
	timeoutMs?: number;
	ticketId?: string;
	planId?: string;
	/** Run without blocking the caller; the session is woken when it finishes. */
	background?: boolean;
	/** Reuse an identical job instead of running it again (default true). */
	dedupe?: boolean;
}

export interface DispatchOutcome {
	jobId: string;
	assignmentId?: string;
	provider: string;
	status: FleetJob["status"];
	/** True when an identical job was reused instead of running a new one. */
	deduped: boolean;
	output?: string;
	stderr?: string;
	exitCode?: number | null;
	startedAt: string;
	endedAt?: string;
	durationMs?: number;
	logPath?: string;
}

export function dispatchKey(input: DispatchInput): string {
	return dispatchKeyFor(input.provider, input.task, input.cwd, input.model);
}

/**
 * Dispatches a task to another model CLI.
 *
 * In background mode the call returns as soon as the job is on the books; the
 * provider keeps running and the session is woken through the outbox when the
 * result lands.
 */
export async function dispatch(
	input: DispatchInput,
	opts: { onTick?: (tail: string) => void; signal?: AbortSignal } = {},
): Promise<DispatchOutcome> {
	const spec = getProvider(input.provider);
	if (!spec) {
		throw new Error(`Unknown provider "${input.provider}". Available: ${providers.map((p) => p.id).join(", ")}`);
	}

	const cwd = input.cwd;
	if (!existsSync(cwd)) {
		throw new Error(`Working directory does not exist: ${cwd}`);
	}

	const key = dispatchKey(input);

	// Idempotency: the same task to the same provider in the same place is one job.
	if (input.dedupe !== false) {
		const existing = findJobByDispatchKey(key);
		if (existing && (existing.status === "queued" || existing.status === "running")) {
			return {
				jobId: existing.id,
				provider: spec.id,
				status: existing.status,
				deduped: true,
				startedAt: existing.startedAt,
				output: existing.output,
			};
		}
		if (
			existing &&
			existing.status === "succeeded" &&
			Date.now() - Date.parse(existing.endedAt ?? existing.startedAt) < DEDUPE_TTL_MS
		) {
			return {
				jobId: existing.id,
				provider: spec.id,
				status: existing.status,
				deduped: true,
				startedAt: existing.startedAt,
				endedAt: existing.endedAt,
				durationMs: existing.durationMs,
				exitCode: existing.exitCode,
				output: existing.output,
			};
		}
	}

	// Budget gate: the catalog decides whether this provider may take another call today.
	const budget = withinBudget(spec.id);
	if (!budget.ok) {
		throw new Error(
			`Budget stop for ${spec.id}: ${budget.reason}. Pick another provider or wait for the next budget day.`,
		);
	}

	const assignment = startAssignment({
		ticketId: input.ticketId,
		provider: spec.id,
		task: input.task,
		cwd,
		model: input.model,
	});

	const jobId = newJobId();
	const startedAt = new Date().toISOString();
	writeJob({
		id: jobId,
		provider: spec.id,
		task: input.task,
		cwd,
		model: input.model,
		status: "queued",
		exitCode: null,
		startedAt,
		dispatchKey: key,
		ticketId: input.ticketId,
		planId: input.planId,
	});

	const args = spec.buildArgs({
		prompt: input.task,
		cwd,
		model: input.model,
		maxTurns: input.maxTurns,
	});

	if (input.background) {
		// Fire and forget: the ledger already holds the work, so the process
		// may die without losing the assignment.
		void executeJob({
			spec,
			jobId,
			assignmentId: assignment.id,
			args,
			cwd,
			model: input.model,
			task: input.task,
			ticketId: input.ticketId,
			planId: input.planId,
			timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		}).catch((err) => {
			patchJob(jobId, {
				status: "failed",
				endedAt: new Date().toISOString(),
				note: `dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
			});
			finishAssignment(assignment.id, "failed", null, "", String(err));
			enqueueOutbox("stream", "alert", `❌ ${spec.label} 派单失败 (job ${jobId}): ${String(err)}`);
			flushOutbox();
		});

		return {
			jobId,
			assignmentId: assignment.id,
			provider: spec.id,
			status: "queued",
			deduped: false,
			startedAt,
		};
	}

	const outcome = await executeJob({
		spec,
		jobId,
		assignmentId: assignment.id,
		args,
		cwd,
		model: input.model,
		task: input.task,
		ticketId: input.ticketId,
		planId: input.planId,
		timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		onTick: opts.onTick,
		signal: opts.signal,
	});

	return { ...outcome, assignmentId: assignment.id };
}

interface ExecuteArgs {
	spec: ProviderSpec;
	jobId: string;
	assignmentId: string;
	args: string[];
	cwd: string;
	model?: string;
	task: string;
	ticketId?: string;
	planId?: string;
	timeoutMs: number;
	onTick?: (tail: string) => void;
	signal?: AbortSignal;
}

async function executeJob(input: ExecuteArgs): Promise<DispatchOutcome> {
	const { spec, jobId, assignmentId } = input;
	const startedAt = new Date().toISOString();

	patchJob(jobId, { status: "running", startedAt });

	const result = await runProvider(spec, input.args, input.cwd, input.timeoutMs, input.signal, input.onTick, (pid) => {
		patchJob(jobId, { pid });
	});

	const parsed = spec.parseOutput(result.stdout, result.stderr);
	const failed =
		result.timedOut ||
		result.cancelled ||
		result.code !== 0 ||
		(spec.isFailure?.(result.code, result.stdout, result.stderr) ?? false);
	const status: FleetJob["status"] = result.timedOut
		? "timeout"
		: result.cancelled
			? "cancelled"
			: failed
				? "failed"
				: "succeeded";
	const endedAt = new Date().toISOString();
	const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
	const logPath = `~/.pi/agent/fleet/jobs/${jobId}/output.log`;

	patchJob(jobId, {
		status,
		exitCode: result.code,
		endedAt,
		durationMs,
		output: truncate(parsed.text, 4000),
		stderr: truncate(result.stderr, 2000),
		pid: undefined,
	});
	writeJobLog(jobId, `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`);

	// Ledger: assignment finished, report written, ticket updated, budget spent.
	finishAssignment(
		assignmentId,
		status === "succeeded" ? "succeeded" : status === "timeout" ? "timeout" : status === "cancelled" ? "cancelled" : "failed",
		result.code,
		parsed.text ?? "",
		result.stderr ?? "",
		logPath,
	);
	addReport({
		ticketId: input.ticketId,
		assignmentId,
		status: status === "succeeded" ? "ready" : status === "timeout" ? "blocked" : "failed",
		evidence: { exitCode: result.code, durationMs, logPath },
		impact: `provider=${spec.id} cwd=${input.cwd}`,
	});
	if (input.ticketId) enqueueOutbox("stream", "heartbeat", heartbeatSnapshot(60));

	// The outbox is the delivery channel: the session is woken from here.
	const head = parsed.text?.trim() ? truncate(parsed.text, 1500) : truncate(result.stderr || result.stdout, 1500);
	const line =
		status === "succeeded"
			? `✅ ${spec.label} 完成 job ${jobId}（${durationMs}ms）\n${head}`
			: `❌ ${spec.label} ${status} job ${jobId}（exit=${result.code}）\n${head}`;
	enqueueOutbox("stream", "summary", line);
	flushOutbox();

	if (input.planId) planProgress(input.planId);

	return {
		jobId,
		assignmentId,
		provider: spec.id,
		status,
		deduped: false,
		output: truncate(parsed.text, 4000),
		stderr: truncate(result.stderr, 2000),
		exitCode: result.code,
		startedAt,
		endedAt,
		durationMs,
		logPath,
	};
}

/**
 * Finds jobs that were still in flight when the session died and closes them.
 * A provider process whose pid is gone cannot come back with a result.
 */
export function reconcileOrphanedJobs(): string[] {
	const closed: string[] = [];
	for (const job of openJobs()) {
		const pid = job.pid;
		if (pid && isAlive(pid)) continue;
		// A job without a pid was queued but never started.
		const note = pid ? `provider process ${pid} is gone` : "job never started";
		patchJob(job.id, {
			status: "orphaned",
			endedAt: new Date().toISOString(),
			note,
		});
		closed.push(job.id);
		enqueueOutbox("stream", "alert", `⚠️ job ${job.id}（${job.provider}）中断：${note}`);
	}
	return closed;
}

/** True when a process with this pid exists. */
export function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		// EPERM means the process exists but belongs to another user.
		return code === "EPERM";
	}
}
