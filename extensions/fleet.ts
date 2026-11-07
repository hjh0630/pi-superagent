/**
 * pi-model-fleet — dispatch a task from this Pi session to another model CLI.
 *
 * Tool:  assign_model  (model-callable)
 * Cmd:   /fleet        (human-callable: providers | list | show <id> | run <provider> <task> | wait <id> | collect | cancel <id>)
 *
 * M1 scope: background dispatch. A background job returns its job id right
 * away, keeps running while the session does other things, and wakes the
 * session through the outbox when the result lands.
 */

import { existsSync } from "node:fs";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getProvider, providers } from "../providers/registry.ts";
import { DEFAULT_TIMEOUT_MS, runProvider, truncate } from "../providers/run.ts";
import { listJobs, newJobId, patchJob, readJob, writeJob, writeJobLog } from "../store/jobs.ts";
import { dispatch, reconcileOrphanedJobs, isAlive } from "../store/runner.ts";
import { composeTask, resolveExecutor } from "../store/roles.ts";
import { bindRuntime, flushOutbox } from "../runtime.ts";
import { formatRun, getRun, listRuns, runPipeline } from "../store/pipeline.ts";

export default function fleet(pi: ExtensionAPI) {
	// Inside a fleet child pi runtime the tool must not exist again, otherwise
	// a task could dispatch to itself forever.
	if (process.env.PI_FLEET_CHILD === "1") return;

	bindRuntime(pi);

	pi.registerTool({
		name: "assign_model",
		label: "Assign Model",
		description:
			"Hand a task to another model CLI (gemini, grok, codex, claude, pi) and get its answer. " +
			"Use it when the task benefits from a second model: a different vendor, a big context, or " +
			"an independent review of code that this session just wrote. " +
			"Always pass an explicit cwd; the CLI runs there with full tool access. " +
			"Set background=true to get the job id immediately and keep working: the session is woken " +
			"when the result lands. Repeating an identical task returns the existing job instead of running it twice.",
		parameters: Type.Object({
			provider: Type.String({
				description: `Target CLI id. One of: ${providers.map((p) => p.id).join(", ")}.`,
			}),
			task: Type.String({ description: "The task for the other model. Be explicit about what to do and what to return." }),
			cwd: Type.Optional(Type.String({ description: "Working directory for the run (defaults to the session directory)." })),
			model: Type.Optional(Type.String({ description: "Model id handed to the target CLI." })),
			max_turns: Type.Optional(Type.Number({ description: "Turn budget (grok only)." })),
			timeout_ms: Type.Optional(Type.Number({ description: "Timeout in milliseconds (default 900000)." })),
			ticket_id: Type.Optional(Type.String({ description: "Ticket id from new_ticket. Links the run and its evidence to the ticket." })),
			background: Type.Optional(Type.Boolean({
				description: "Run without blocking: return the job id now, the session is woken when it finishes.",
			})),
			dedupe: Type.Optional(Type.Boolean({
				description: "Reuse an identical in-flight or recent job instead of running it again (default true).",
			})),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
			const spec = getProvider(params.provider);
			if (!spec) {
				throw new Error(
					`Unknown provider "${params.provider}". Available: ${providers.map((p) => p.id).join(", ")}`,
				);
			}

			const cwd = params.cwd ?? ctx.cwd ?? process.cwd();
			if (!existsSync(cwd)) {
				throw new Error(`Working directory does not exist: ${cwd}`);
			}

			const background = params.background === true;
			const outcome = await dispatch(
				{
					provider: spec.id,
					task: params.task,
					cwd,
					model: params.model,
					maxTurns: params.max_turns,
					timeoutMs: params.timeout_ms ?? DEFAULT_TIMEOUT_MS,
					ticketId: params.ticket_id,
					background,
					dedupe: params.dedupe,
				},
				{
					signal,
					onTick: background
						? undefined
						: (tail) => onUpdate?.({ content: [{ type: "text", text: `${spec.label} is working…\n${tail}` }], details: undefined }),
				},
			);

			if (outcome.deduped) {
				return {
					content: [
						{
							type: "text",
							text:
								`复用已有 job ${outcome.jobId}（${spec.label}，状态 ${outcome.status}）——同样的任务不重复跑。\n` +
								`${outcome.output ? `\n${truncate(outcome.output)}` : ""}`,
						},
					],
					details: { jobId: outcome.jobId, provider: spec.id, status: outcome.status, deduped: true },
				};
			}

			if (background) {
				return {
					content: [
						{
							type: "text",
							text:
								`已派单（后台）· job ${outcome.jobId} · ${spec.label} · cwd=${cwd}\n` +
								`主回合继续；结果回来会自动唤醒本会话。查看：/fleet show ${outcome.jobId}`,
						},
					],
					details: { jobId: outcome.jobId, provider: spec.id, status: "queued", background: true, cwd },
				};
			}

			const header = outcome.status === "succeeded" ? "completed" : `failed (${outcome.status})`;
			const body = outcome.output?.trim()
				? truncate(outcome.output)
				: `No answer extracted. exit=${outcome.exitCode}\n${truncate(outcome.stderr ?? "", 3000)}`;

			return {
				content: [
					{
						type: "text",
						text: `${spec.label} ${header} (job ${outcome.jobId}, ${outcome.durationMs}ms)\n\n${body}`,
					},
				],
				details: {
					jobId: outcome.jobId,
					provider: spec.id,
					status: outcome.status,
					exitCode: outcome.exitCode,
					cwd,
					durationMs: outcome.durationMs,
					output: outcome.output,
					logPath: outcome.logPath,
				},
			};
		},
	});

	pi.registerTool({
		name: "assign_role",
		label: "Assign Role",
		description:
			"Hand a task to a named role (design / frontend / review / seo / social / deploy). " +
			"The role's standing brief is prepended automatically and a usable executor is chosen by health, " +
			"so a plan can name roles instead of specific CLIs.",
		parameters: Type.Object({
			role: Type.String({ description: "Role id: design, frontend, review, seo, social, deploy." }),
			task: Type.String({ description: "What this role should do (the brief is prepended for you)." }),
			cwd: Type.Optional(Type.String({ description: "Working directory for the run." })),
			ticket_id: Type.Optional(Type.String({ description: "Ticket this run belongs to." })),
			background: Type.Optional(Type.Boolean({ description: "Run without blocking; the session is woken when it lands." })),
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
			const role = resolveExecutor(params.role);
			const cwd = params.cwd ?? ctx.cwd ?? process.cwd();
			if (!existsSync(cwd)) throw new Error(`Working directory does not exist: ${cwd}`);

			const outcome = await dispatch(
				{
					provider: role.executor,
					task: composeTask(role, params.task),
					cwd,
					ticketId: params.ticket_id,
					background: params.background === true,
					dedupe: false,
				},
				{
					signal,
					onTick: params.background ? undefined : (tail) => onUpdate?.({ content: [{ type: "text", text: `${role.label}（${role.executor}）正在工作…\n${tail}` }], details: undefined }),
				},
			);

			if (params.background) {
				return {
					content: [
						{
							type: "text",
							text: `已派给角色「${role.label}」（执行器 ${role.executor}）· job ${outcome.jobId}\n结果回来会自动唤醒本会话。`,
						},
					],
					details: { jobId: outcome.jobId, role: params.role, provider: role.executor, status: "queued", background: true },
				};
			}
			const header = outcome.status === "succeeded" ? "完成" : `失败（${outcome.status}）`;
			return {
				content: [
					{
						type: "text",
						text: `${role.label}（${role.executor}）${header}（job ${outcome.jobId}, ${outcome.durationMs}ms）\n\n${outcome.output ?? outcome.stderr ?? ""}`,
					},
				],
				details: { jobId: outcome.jobId, role: params.role, provider: role.executor, status: outcome.status, output: outcome.output },
			};
		},
	});

	pi.registerTool({
		name: "verify_change",
		label: "Verify Change",
		description:
			"Run the five-step acceptance pipeline on a change: read-only review (max 3 rounds) → checks → " +
			"merge → publish → verify. Every step writes evidence. Merge and publish are L3: they produce an " +
			"approval card and do NOT run until a human releases them. Use dry_run=true to see the plan without " +
			"executing anything irreversible.",
		parameters: Type.Object({
			cwd: Type.String({ description: "Directory with the change (must be an explicit path)." }),
			ticket_id: Type.Optional(Type.String({ description: "Ticket this verification belongs to." })),
			checks: Type.Optional(Type.Array(Type.String(), {
				description: "Commands for the check step (tests, build). Each one is run and its exit code recorded.",
			})),
			review_rounds: Type.Optional(Type.Number({ description: "Review rounds, capped at 3 (default 1)." })),
			merge_command: Type.Optional(Type.String({ description: "Exact command for the merge step (needs approval)." })),
			publish_command: Type.Optional(Type.String({ description: "Exact command for the publish step (needs approval)." })),
			verify_command: Type.Optional(Type.String({ description: "Command that verifies the result after publishing." })),
			dry_run: Type.Optional(Type.Boolean({ description: "Record what would happen, run nothing irreversible." })),
			reviewer: Type.Optional(Type.String({ description: "Provider for the review rounds. Omit to let the router pick." })),
		}),
		async execute(_toolCallId, params) {
			const result = await runPipeline({
				cwd: params.cwd,
				ticketId: params.ticket_id,
				checks: params.checks,
				reviewRounds: params.review_rounds,
				mergeCommand: params.merge_command,
				publishCommand: params.publish_command,
				verifyCommand: params.verify_command,
				dryRun: params.dry_run,
				reviewer: params.reviewer,
			});
			return {
				content: [{ type: "text", text: result.report }],
				details: {
					runId: result.run.id,
					status: result.run.status,
					steps: result.run.steps.map((s) => ({ name: s.name, status: s.status, rounds: s.rounds.length })),
					approvals: result.approvals,
					dryRun: result.run.dry_run,
				},
			};
		},
	});

	pi.registerCommand("fleet", {
		description: "pi-model-fleet: providers, jobs, and one-off runs",
		handler: async (args: string, ctx: ExtensionContext) => {
			const [verb = "", ...rest] = args.trim().split(/\s+/);
			const notify = (msg: string, level: "info" | "warning" | "error" = "info") => ctx.ui.notify(msg, level);

			if (!verb || verb === "status") {
				const jobs = listJobs(5);
				const lines = [
					`providers: ${providers.map((p) => `${p.id}(${p.version ?? "?"})`).join(", ")}`,
					...jobs.map((j) => `  ${j.id}  ${j.provider.padEnd(7)} ${j.status.padEnd(9)} ${j.task.slice(0, 60)}`),
				];
				notify(lines.join("\n"));
				return;
			}

			if (verb === "providers") {
				notify(
					providers
						.map((p) => `${p.id}: ${p.label} ${p.version ?? ""}\n  caps: ${Object.entries(p.capabilities ?? {}).map(([k, v]) => `${k}=${v}`).join(", ")}`)
						.join("\n"),
				);
				return;
			}

			if (verb === "list" || verb === "jobs") {
				const jobs = listJobs(20);
				notify(jobs.length ? jobs.map((j) => `${j.id}  ${j.provider}  ${j.status}  ${j.task.slice(0, 70)}`).join("\n") : "No jobs yet.");
				return;
			}

			if (verb === "show") {
				const job = readJob(rest[0] ?? "");
				if (!job) {
					notify(`No such job: ${rest[0] ?? ""}`, "error");
					return;
				}
				notify(`${job.id}  ${job.provider}  ${job.status}\ncwd: ${job.cwd}\n\n${job.output ?? ""}${job.note ? `\n\nnote: ${job.note}` : ""}`);
				return;
			}

			if (verb === "bg") {
				const providerId = rest.shift();
				const spec = providerId ? getProvider(providerId) : undefined;
				if (!spec) {
					notify(`Usage: /fleet bg <provider> <task>  (providers: ${providers.map((p) => p.id).join(", ")})`, "warning");
					return;
				}
				const task = rest.join(" ");
				if (!task) {
					notify("Usage: /fleet bg <provider> <task>", "warning");
					return;
				}
				const cwd = ctx.cwd ?? process.cwd();
				const outcome = await dispatch({
					provider: spec.id,
					task,
					cwd,
					background: true,
					dedupe: false,
				});
				notify(`已派单（后台）· job ${outcome.jobId} · ${spec.label}\n结果回来会自动唤醒本会话。`);
				return;
			}

			if (verb === "wait") {
				const id = rest[0] ?? "";
				const deadline = Date.now() + 120_000;
				let job = readJob(id);
				while (job && (job.status === "queued" || job.status === "running") && Date.now() < deadline) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					job = readJob(id);
				}
				if (!job) {
					notify(`No such job: ${id}`, "error");
					return;
				}
				notify(`${job.id}  ${job.provider}  ${job.status}\n\n${job.output ?? job.stderr ?? ""}`);
				return;
			}

			if (verb === "verify") {
				if (rest.length === 0) {
					const runs = listRuns(10);
					notify(
						runs.length
							? runs.map((r) => `${r.id}  ${r.status.padEnd(9)} ${r.dry_run ? "dry " : "    "}${r.cwd}`).join("\n")
							: "No verification runs yet.",
					);
					return;
				}
				const run = getRun(rest[0]);
				if (!run) {
					notify(`No such verification run: ${rest[0]}`, "error");
					return;
				}
				notify(formatRun(run));
				return;
			}

			if (verb === "collect") {
				const sent = flushOutbox();
				notify(sent ? `已投递 ${sent} 条待发消息。` : "没有待发消息。");
				return;
			}

			if (verb === "cancel") {
				const id = rest[0] ?? "";
				const job = readJob(id);
				if (!job) {
					notify(`No such job: ${id}`, "error");
					return;
				}
				if (job.pid && isAlive(job.pid)) {
					try {
						process.kill(job.pid);
					} catch {
						/* already gone */
					}
				}
				patchJob(id, { status: "cancelled", endedAt: new Date().toISOString(), note: "cancelled by human" });
				notify(`job ${id} cancelled.`);
				return;
			}

			if (verb === "run") {
				const providerId = rest.shift();
				const spec = providerId ? getProvider(providerId) : undefined;
				if (!spec) {
					notify(`Usage: /fleet run <provider> <task>  (providers: ${providers.map((p) => p.id).join(", ")})`, "warning");
					return;
				}
				const task = rest.join(" ");
				if (!task) {
					notify("Usage: /fleet run <provider> <task>", "warning");
					return;
				}
				const cwd = ctx.cwd ?? process.cwd();
				notify(`${spec.label} started in ${cwd} …`);
				const startedAt = new Date().toISOString();
				const result = await runProvider(spec, spec.buildArgs({ prompt: task, cwd }), cwd, DEFAULT_TIMEOUT_MS, undefined);
				const parsed = spec.parseOutput(result.stdout, result.stderr);
				const failed = result.code !== 0 || result.timedOut || result.cancelled;
				const endedAt = new Date().toISOString();
				const id = newJobId();
				writeJob({
					id,
					provider: spec.id,
					task,
					cwd,
					status: result.timedOut ? "timeout" : result.cancelled ? "cancelled" : failed ? "failed" : "succeeded",
					exitCode: result.code,
					startedAt,
					endedAt,
					durationMs: Date.parse(endedAt) - Date.parse(startedAt),
					output: truncate(parsed.text, 4000),
					stderr: truncate(result.stderr, 2000),
				});
				writeJobLog(id, `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`);
				notify(
					parsed.text?.trim()
						? truncate(parsed.text, 3000)
						: `exit=${result.code}\n${truncate(result.stderr || result.stdout, 2000)}`,
				);
				return;
			}

			notify("Usage: /fleet [status|providers|list|show <id>|bg <provider> <task>|wait <id>|collect|cancel <id>|verify [run-id]|run <provider> <task>]", "warning");
		},
	});

	// A session that starts after a crash must not leave half-finished jobs
	// in the ledger, and messages queued while pi was closed still owe a delivery.
	pi.on("session_start", async (_event, ctx) => {
		const closed = reconcileOrphanedJobs();
		const sent = flushOutbox();
		if (closed.length || sent) {
			const parts: string[] = [];
			if (closed.length) parts.push(`收尾 ${closed.length} 个中断 job`);
			if (sent) parts.push(`补投 ${sent} 条消息`);
			ctx.ui.notify(`fleet: ${parts.join("，")}`, "warning");
		}
	});

	// Deliver queued messages when the agent stops, not in the middle of a turn.
	pi.on("agent_settled", async () => {
		flushOutbox();
	});
}
