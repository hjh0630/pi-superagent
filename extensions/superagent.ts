/**
 * pi-superagent — the orchestration layer around pi-model-fleet.
 *
 * M0 scope: the ledger (tickets / assignments / reports / events / outbox /
 * decisions), the capability catalog, the daily budget gate and the hourly
 * heartbeat snapshot.
 *
 * M1 scope: 12-hour plan windows. A plan is a batch of steps with budget and
 * acceptance that a human approves before anything runs — not a paragraph.
 *
 * The heartbeat is a template over the ledger, not a model call: 24 snapshots
 * a day must cost nothing, and it must never be the thing that interrupts the
 * human.
 */

import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	addDecision,
	createPlan,
	createTicket,
	enqueueOutbox,
	getPlan,
	heartbeatSnapshot,
	listDecisions,
	listPlans,
	listTickets,
	getTicket,
	pendingOutbox,
} from "../store/ledger.ts";
import { budgetFor, loadRules, routeFor, withinBudget } from "../store/catalog.ts";
import { providers } from "../providers/registry.ts";
import { approvePlanAndDispatch, rejectPlanForHuman } from "../store/plans.ts";
import { bindRuntime, flushOutbox } from "../runtime.ts";
import {
	approvalCard,
	argsHash,
	createApproval,
	decideApproval,
	expireStaleApprovals,
	extendApproval,
	findApprovedByHash,
	findPendingByHash,
	getApproval,
	listApprovals,
	pendingApprovals,
	type Approval,
} from "../store/approvals.ts";
import { classify, levelLabel, policy } from "../store/levels.ts";
import { readApprovals, sendApprovalCard } from "../store/channels/dingtalk.ts";
import { createDraft, draftCard, getDraft, listDrafts, setDraftStatus } from "../store/drafts.ts";
import { listRoles } from "../store/roles.ts";
import { formatPanel, panel, watchdog, writeResumeNote } from "../store/panel.ts";
import { readRunWindow, writeRunWindow, clearRunWindow } from "../store/runwindow.ts";

/** One line the human can read: what exactly is about to happen. */
function describeAction(toolName: string, input: Record<string, unknown>): string {
	const command = typeof input.command === "string" ? input.command : "";
	if (command) return `${toolName}: ${command.replace(/\s+/g, " ").slice(0, 120)}`;
	const path = [input.path, input.file_path, input.filePath].find((v) => typeof v === "string");
	if (path) return `${toolName}: ${String(path)}`;
	return `${toolName}: ${JSON.stringify(input).slice(0, 120)}`;
}

/**
 * Reads the human's answers from DingTalk.
 * A todo the human completed means "approved"; cards nobody touched stay
 * blocked until they expire (expiry means "not released").
 */
async function syncApprovalsFromDingtalk(): Promise<string> {
	const expired = expireStaleApprovals();
	const result = await readApprovals();
	if (!result.ok) return `钉钉读取失败：${result.note ?? "未知原因"}`;
	const pending = pendingApprovals();
	const approved: string[] = [];
	for (const approval of pending) {
		if (!result.done.has(approval.code)) continue;
		const decision = decideApproval(approval.id, "allow_once", "dingtalk");
		if (!decision.ok) continue;
		approved.push(approval.id);
		enqueueOutbox(
			"decision",
			"summary",
			`✅ 审批 ${approval.id}（${approval.code}）的钉钉待办已完成 = 批准。请重新执行被拦截的动作：${approval.tool_name}`,
		);
	}
	flushOutbox();
	return `钉钉同步完成：批准 ${approved.length}｜过期 ${expired.length}｜仍待批 ${pendingApprovals().length}`;
}

export default function superagent(pi: ExtensionAPI) {
	if (process.env.PI_FLEET_CHILD === "1") return;

	bindRuntime(pi);

	pi.registerTool({
		name: "new_ticket",
		label: "New Ticket",
		description:
			"Open a unit of authorized work in the ledger. Use it for anything a person should be able to see, " +
			"approve, or audit later. A ticket carries an intent, an acceptance criterion and a budget. " +
			"Dispatch the actual work with assign_model and pass the ticket id.",
		parameters: Type.Object({
			title: Type.String({ description: "Short title of the unit of work." }),
			intent: Type.Optional(Type.String({ description: "What outcome is wanted, in one or two sentences." })),
			acceptance: Type.Optional(Type.String({ description: "How we will know it is done (tests, diff, deploy check...)." })),
			budget_cents: Type.Optional(Type.Number({ description: "Budget in cents for this ticket (0 = no limit)." })),
		}),
		async execute(_id, params) {
			const ticket = createTicket({
				title: params.title,
				intent: params.intent,
				acceptance: params.acceptance,
				budgetCents: params.budget_cents,
			});
			return {
				content: [
					{
						type: "text",
						text: `Ticket ${ticket.id} created: ${ticket.title}\nPass this id to assign_model so the work and its evidence land on the ticket.`,
					},
				],
				details: { ticketId: ticket.id, status: ticket.status },
			};
		},
	});

	pi.registerTool({
		name: "record_decision",
		label: "Record Decision",
		description:
			"Remember a decision the human already made, so it is never asked again. " +
			"kind='decided' for things they approved (with the exact scope), kind='rejected' for things they refused " +
			"(the agent should answer with that instead of asking again).",
		parameters: Type.Object({
			kind: Type.String({ description: "'decided' or 'rejected'." }),
			text: Type.String({ description: "The decision, in the human's own words." }),
			scope: Type.Optional(Type.String({ description: "What it applies to (e.g. 'publishing', 'spend>100usd')." })),
		}),
		async execute(_id, params) {
			const decisionId = addDecision({
				kind: params.kind === "rejected" ? "rejected" : "decided",
				scope: params.scope,
				text: params.text,
			});
			return { content: [{ type: "text", text: `Decision ${decisionId} recorded (${params.kind}).` }], details: { decisionId } };
		},
	});

	pi.registerTool({
		name: "new_draft",
		label: "New Draft",
		description:
			"Prepare an outbound artefact (post, email, PR description, script) as a DRAFT and stop. " +
			"Use the five elements: result, source, constraints, deliverable, stop point. " +
			"Never send or publish it yourself — a draft only becomes sendable after a human releases it " +
			"(/super send <id> creates the approval card).",
		parameters: Type.Object({
			title: Type.String({ description: "Short title of the draft." }),
			target: Type.String({ description: "Who or where it goes (person, channel, repo...)." }),
			source: Type.Optional(Type.String({ description: "Where the facts come from." })),
			constraints: Type.Optional(Type.String({ description: "What must not happen (no cc, no links, no claims...)." })),
			deliverable: Type.Optional(Type.String({ description: "What the reader gets." })),
			stop_at: Type.Optional(Type.String({ description: "Where it must stop and wait for a human." })),
			content: Type.Optional(Type.String({ description: "The drafted text itself." })),
			ticket_id: Type.Optional(Type.String({ description: "Ticket this draft belongs to." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const draft = createDraft({
				title: params.title,
				target: params.target,
				source: params.source,
				constraints: params.constraints,
				deliverable: params.deliverable,
				stopAt: params.stop_at,
				content: params.content,
				ticketId: params.ticket_id,
			});
			const card = draftCard(draft);
			enqueueOutbox("decision", "alert", card);
			flushOutbox();
			ctx.ui.notify(`草稿 ${draft.id} 已就绪，等人点头再发`, "info");
			return {
				content: [
					{
						type: "text",
						text:
							`${card}\n\n停在这里：**不要**自己发送或发布。` +
							`人要点头才会变成可发送（/super send ${draft.id} → 审批卡 → 批准）。`,
					},
				],
				details: { draftId: draft.id, target: draft.target, status: draft.status },
			};
		},
	});

	pi.registerTool({
		name: "new_plan",
		label: "New Plan",
		description:
			"Propose a 12-hour work window. A plan is a list of concrete steps (each with a task, an acceptance " +
			"criterion and a budget), not a paragraph — the human approves or rejects it before anything runs. " +
			"Use it for work that spans hours, never for a single immediate task (use assign_model for that). " +
			"After the human approves with /super approve, the steps are dispatched automatically.",
		parameters: Type.Object({
			title: Type.String({ description: "Short title of the window." }),
			summary: Type.Optional(Type.String({ description: "What this window is for, in one or two sentences." })),
			window_hours: Type.Optional(Type.Number({ description: "Length of the window in hours (default 12, max 48)." })),
			ticket_id: Type.Optional(Type.String({ description: "Ticket this plan belongs to." })),
			steps: Type.Array(
				Type.Object({
					title: Type.String({ description: "Short step title." }),
					task: Type.String({ description: "What the executor has to do." }),
					depends_on: Type.Optional(Type.Array(Type.String(), {
						description: "Ids of steps that must finish first (e.g. review waits for build).",
					})),
					role: Type.Optional(Type.String({ description: "Role id (design, frontend, review, seo, social, deploy). The role's brief is prepended and its executor chosen." })),
					provider: Type.Optional(Type.String({ description: "Executor id. Omit to let the router choose from the tag." })),
					tag: Type.Optional(Type.String({ description: "Capability tag for routing: code, review, code-review, research, general." })),
					acceptance: Type.Optional(Type.String({ description: "How we will know this step is done." })),
					budget_cents: Type.Optional(Type.Number({ description: "Budget in cents for this step (0 = no limit)." })),
				}),
				{ description: "Ordered steps to run inside the window." },
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const plan = createPlan({
				title: params.title,
				summary: params.summary,
				windowHours: params.window_hours,
				ticketId: params.ticket_id,
				steps: params.steps.map((step, index) => ({
					id: `s${index + 1}`,
					title: step.title,
					task: step.task,
					dependsOn: step.depends_on,
					provider: step.provider,
					tag: step.tag,
					acceptance: step.acceptance,
					budgetCents: step.budget_cents,
				})),
			});

			const lines = [
				`📋 计划 ${plan.id} 待你批准`,
				`${plan.title}`,
				`窗口：${plan.window_start.slice(0, 16).replace("T", " ")} → ${plan.window_end.slice(0, 16).replace("T", " ")}（${params.window_hours ?? 12}h）`,
				...plan.steps.map((s) => `  ${s.id}. ${s.title}  [${s.provider ?? s.tag ?? "general"}]${s.acceptance ? ` — ${s.acceptance}` : ""}`),
				"",
				`批准：/super approve ${plan.id}`,
				`拒绝：/super reject ${plan.id}`,
			].join("\n");

			enqueueOutbox("decision", "alert", lines);
			flushOutbox();
			ctx.ui.notify(`计划 ${plan.id} 待批准（${plan.steps.length} 步）`, "info");

			return {
				content: [
					{
						type: "text",
						text:
							`计划 ${plan.id} 已提交，等人批准后才执行。\n${lines}\n` +
							`批准前不要派发这些步骤——人没点头就不动手。`,
					},
				],
				details: { planId: plan.id, status: plan.status, steps: plan.steps.length },
			};
		},
	});

	/* ---------------------------------------------------------------------
	 * M2: the approval gate.
	 *
	 * L0-L2 run by default. L3 (irreversible or outward-facing) waits for a
	 * human: a card in the ledger, a card in the session, and — when the
	 * DingTalk channel is on — a todo on the phone. Expired means "not
	 * released".
	 * ------------------------------------------------------------------- */
	pi.on("tool_call", async (event, ctx) => {
		const toolName = event.toolName;
		const input = (event.input ?? {}) as Record<string, unknown>;
		const classification = classify(toolName, input);
		if (classification.level !== "L3") return;

		// An answer the human already gave for this scope wins — unless the rule
		// is a standing "ask first", where asking always wins (Grok Bot's rule).
		if (classification.remembered?.kind === "decided" && !classification.alwaysAsk) return;
		if (classification.remembered?.kind === "rejected") {
			return { block: true, reason: `这个动作此前已被拒绝：${classification.remembered.text}` };
		}

		const hash = argsHash(toolName, input);
		if (findApprovedByHash(hash)) return; // this exact action was approved before

		const waiting = findPendingByHash(hash);
		if (waiting) {
			if (Date.now() <= Date.parse(waiting.expires_at)) {
				return {
					block: true,
					reason: `等审批 ${waiting.id}（${waiting.code}）：${waiting.title}｜批准：/super approve ${waiting.id}`,
				};
			}
			// The old card ran out: expiry means "not released", so a new card is needed.
			decideApproval(waiting.id, "deny");
		}

		const approval = createApproval({
			title: describeAction(toolName, input),
			detail: classification.matched ? `命中规则：${classification.matched}` : undefined,
			level: classification.level,
			scope: classification.scope,
			toolName,
			args: input,
			expiresMinutes: policy().expiresMinutes,
			channel: "session",
		});

		// At the terminal the human is right there: ask once, no todo needed.
		if (ctx.mode === "tui" && ctx.hasUI) {
			const ok = await ctx.ui.confirm(`${levelLabel(approval.level)} 动作要你点头`, approvalCard(approval));
			if (ok) {
				decideApproval(approval.id, "allow_once", "human");
				return;
			}
			decideApproval(approval.id, "deny", "human");
			return { block: true, reason: `人拒绝了：${approval.title}` };
		}

		// Everywhere else (phone, RPC, print): the card waits in the session and on the phone.
		enqueueOutbox("decision", "alert", approvalCard(approval));
		flushOutbox();
		if (policy().channels.includes("dingtalk")) {
			const sent = await sendApprovalCard(approval);
			if (!sent.ok && sent.note) {
				enqueueOutbox("stream", "alert", `⚠️ 钉钉待办没发出去：${sent.note}`);
			}
		}

		return {
			block: true,
			reason:
				`${levelLabel(approval.level)} 动作需要人工批准：${approval.id}（${approval.code}）· ${approval.title}\n` +
				`批准一次：/super approve ${approval.id}｜永久放行：/super approve ${approval.id} always｜拒绝：/super reject ${approval.id}\n` +
				`钉钉待办标题含 [审批${approval.code}]，在钉钉里点“完成”即视为批准；过期=未放行。`,
		};
	});

	pi.registerCommand("super", {
		description: "pi-superagent: tickets, budget, catalog, heartbeat, plans, decisions",
		handler: async (args: string, ctx: ExtensionContext) => {
			const [verb = "", ...rest] = args.trim().split(/\s+/);
			const notify = (msg: string, level: "info" | "warning" | "error" = "info") => ctx.ui.notify(msg, level);

			if (!verb || verb === "tickets") {
				const tickets = listTickets(15);
				notify(
					tickets.length
						? tickets.map((t) => `${t.id}  ${t.status.padEnd(16)} ${t.title.slice(0, 60)}`).join("\n")
						: "No tickets yet. Create one with new_ticket.",
				);
				return;
			}

			if (verb === "ticket") {
				const ticket = getTicket(rest[0] ?? "");
				if (!ticket) {
					notify(`No such ticket: ${rest[0] ?? ""}`, "error");
					return;
				}
				notify(
					`${ticket.id}  ${ticket.status}\n${ticket.title}\n\n意图：${ticket.intent}\n验收：${ticket.acceptance || "(未写)"}`,
				);
				return;
			}

			if (verb === "heartbeat") {
				const snapshot = heartbeatSnapshot(Number(rest[0] || 60));
				enqueueOutbox("stream", "heartbeat", snapshot);
				flushOutbox();
				notify(snapshot);
				return;
			}

			if (verb === "budget") {
				const rows = providers.map((p) => {
					const state = budgetFor(p.id);
					return `${p.id.padEnd(8)} ${String(state.calls).padStart(3)}/${state.maxCalls} calls  ${Math.round(state.seconds / 60)}/${state.maxMinutes} min`;
				});
				notify(rows.join("\n"));
				return;
			}

			if (verb === "catalog") {
				const rules = loadRules();
				notify(
					[
						`rules v${rules.version}`,
						...Object.entries(rules.providers).map(
							([id, r]) => `${id.padEnd(8)} tier${r.tier ?? "?"} caps=${(r.caps ?? []).join(",")}`,
						),
						"routes:",
						...rules.routes.map((r) => `  ${(r.tag ?? "?").padEnd(12)} → ${[...(r.prefer ?? []), ...(r.fallback ?? [])].join(" > ")}`),
					].join("\n"),
				);
				return;
			}

			if (verb === "route") {
				const tag = rest[0] ?? "";
				const candidates = routeFor(tag);
				const status = candidates.map((id) => {
					const check = withinBudget(id);
					return `${id}${check.ok ? "" : ` (${check.reason})`}`;
				});
				notify(status.length ? status.join(" > ") : `No route for tag "${tag}"`, status.length ? "info" : "warning");
				return;
			}

			if (verb === "decisions") {
				const decisions = listDecisions(15);
				notify(
					decisions.length
						? decisions.map((d) => `[${d.kind}] ${d.scope ? `(${d.scope}) ` : ""}${d.text.slice(0, 80)}`).join("\n")
						: "No decisions recorded yet.",
				);
				return;
			}

			if (verb === "plan" || verb === "plans") {
				if (rest.length === 0) {
					const plans = listPlans(15);
					notify(
						plans.length
							? plans.map((p) => `${p.id}  ${p.status.padEnd(18)} ${p.title.slice(0, 50)}  (${p.steps.length} 步)`).join("\n")
							: "No plans yet. Create one with new_plan.",
					);
					return;
				}
				const plan = getPlan(rest[0]);
				if (!plan) {
					notify(`No such plan: ${rest[0]}`, "error");
					return;
				}
				notify(
					[
						`${plan.id}  ${plan.status}`,
						`${plan.title}`,
						`窗口：${plan.window_start.slice(0, 16).replace("T", " ")} → ${plan.window_end.slice(0, 16).replace("T", " ")}`,
						plan.summary,
						"",
						...plan.steps.map((s) => `  ${s.id}. [${s.status ?? "pending"}] ${s.title}  ${s.provider ?? s.tag ?? "general"}${s.jobId ? `  job=${s.jobId}` : ""}${s.acceptance ? `\n     验收：${s.acceptance}` : ""}`),
						plan.status === "awaiting_approval" ? `\n批准：/super approve ${plan.id}` : "",
					]
						.filter(Boolean)
						.join("\n"),
				);
				return;
			}

			if (verb === "panel") {
				notify(formatPanel(panel()));
				return;
			}

			if (verb === "watchdog") {
				const verdict = watchdog();
				const lines = [
					`🐕 Watchdog · ${verdict.at.slice(0, 16).replace("T", " ")}`,
					verdict.summary,
					...verdict.stuck.map((s) => `  🐌 卡住 ${s.id}（${s.provider}）${s.idleMinutes} 分钟没动静：${s.label.slice(0, 50)}`),
					...verdict.expired.map((id) => `  ⌛ 过期未处理 ${id}`),
				];
				notify(lines.join("\n"), verdict.ok ? "info" : "warning");
				return;
			}

			if (verb === "roles") {
				const roles = listRoles();
				notify(
					roles.length
						? roles
								.map((r) => `${r.id.padEnd(10)} ${r.label.padEnd(12)} 执行器 ${r.provider ?? "?"}\n    ${(r.brief ?? "").slice(0, 90)}`)
								.join("\n")
						: "No roles defined. Add them under \"roles\" in rules.json.",
				);
				return;
			}

			if (verb === "drafts") {
				const drafts = listDrafts(15);
				notify(
					drafts.length
						? drafts.map((d) => `${d.id}  ${d.status.padEnd(9)} ${d.target.slice(0, 24).padEnd(26)} ${d.title.slice(0, 40)}`).join("\n")
						: "No drafts yet. Create one with new_draft.",
				);
				return;
			}

			if (verb === "draft") {
				const draft = getDraft(rest[0] ?? "");
				if (!draft) {
					notify(`No such draft: ${rest[0] ?? ""}`, "error");
					return;
				}
				notify(draftCard(draft));
				return;
			}

			if (verb === "send") {
				const draft = getDraft(rest[0] ?? "");
				if (!draft) {
					notify(`No such draft: ${rest[0] ?? ""}`, "error");
					return;
				}
				if (draft.status !== "draft") {
					notify(`草稿 ${draft.id} 当前状态 ${draft.status}，不需要再发。`, "warning");
					return;
				}
				const approval = createApproval({
					title: `发送草稿 ${draft.id}：${draft.title}`,
					detail: `目标：${draft.target}`,
					level: "L3",
					scope: `draft:${draft.id}`,
					toolName: "draft.send",
					args: { draft_id: draft.id, target: draft.target },
					expiresMinutes: 30,
				});
				setDraftStatus(draft.id, "draft", approval.id);
				enqueueOutbox("decision", "alert", approvalCard(approval));
				flushOutbox();
				await sendApprovalCard(approval);
				notify(`草稿 ${draft.id} 已排入审批：${approval.id}（${approval.code}）\n批准：/super approve ${approval.id}`);
				return;
			}

			if (verb === "discard") {
				const draft = getDraft(rest[0] ?? "");
				if (!draft) {
					notify(`No such draft: ${rest[0] ?? ""}`, "error");
					return;
				}
				setDraftStatus(draft.id, "discarded");
				notify(`草稿 ${draft.id} 已丢弃，不会发出去。`);
				return;
			}

			if (verb === "audit") {
				const decisions = listDecisions(50);
				const standing = decisions.filter((d) => d.scope?.startsWith("tool:"));
				const broad = standing.filter((d) => /^tool:[^:]+$/.test(d.scope ?? ""));
				const cards = listApprovals(20);
				notify(
					[
						`🔍 规则复核 · ${new Date().toISOString().slice(0, 10)}`,
						"",
						`常设授权（${standing.length}）`,
						...standing.map(
							(d) =>
								`  ${d.kind === "rejected" ? "⛔ 永久拒绝" : "✅ 永久放行"} ${d.scope}  ← ${d.text.slice(0, 50)}（${d.decided_at.slice(0, 16).replace("T", " ")}）`,
						),
						...(broad.length
							? ["", `⚠️ 范围偏宽（${broad.length}）：${broad.map((d) => d.scope).join("、")}——建议改成带具体动作的 scope`]
							: []),
						"",
						`最近审批卡（${cards.length}）`,
						...cards.map(
							(c) =>
								`  ${c.status === "approved" ? "✅" : c.status === "rejected" ? "⛔" : c.status === "expired" ? "⌛" : "⏳"} ${c.id} ${c.status.padEnd(9)} ${c.scope ?? "-"}`,
						),
						"",
						"复核清单：① 过期卡 ≠ 已放行（过期不会补做）② always 列表里有没有你已忘了的条目 ③ 拒绝之后去源系统确认真的没发生",
					].join("\n"),
				);
				return;
			}

			if (verb === "approvals") {
				const rows = listApprovals(15);
				notify(
					rows.length
						? rows
								.map(
									(a) =>
										`${a.id}  ${a.status.padEnd(9)} ${a.level}  ${a.code}  ${a.title.slice(0, 46)}\n` +
										`         截止 ${a.expires_at.slice(11, 16)}｜scope=${a.scope ?? "-"}`,
								)
								.join("\n")
						: "No approvals yet.",
				);
				return;
			}

			if (verb === "levels") {
				const rules = loadRules() as ReturnType<typeof loadRules> & {
					levels?: Record<string, { label?: string; desc?: string }>;
				};
				notify(
					[
						"分级自主：",
						...Object.entries(rules.levels ?? {}).map(([k, v]) => `  ${k} ${v.label ?? ""} · ${v.desc ?? ""}`),
						"",
						`默认级别 ${policy().defaultLevel}｜审批过期 ${policy().expiresMinutes} 分钟｜通道 ${policy().channels.join(",")}`,
						"规则：",
						...policy().rules.map(
							(r) =>
								`  ${(r.tool ?? "*").padEnd(12)} ${r.level}  ${r.desc ?? ""}${r.commandContains ? ` [${r.commandContains.join(", ")}]` : ""}`,
						),
					].join("\n"),
				);
				return;
			}

			if (verb === "sync") {
				notify(await syncApprovalsFromDingtalk());
				return;
			}

			if (verb === "approve") {
				const target = rest[0] ?? "";
				if (target.startsWith("ap-")) {
					const approval = getApproval(target);
					if (!approval) {
						notify(`No such approval: ${target}`, "error");
						return;
					}
					const always = rest.slice(1).some((a) => a.toLowerCase() === "always");
					const decision = decideApproval(target, always ? "always" : "allow_once", "human");
					if (!decision.ok) {
						notify(decision.reason ?? "审批失败", "warning");
						return;
					}
					if (always && approval.scope) {
						addDecision({
							kind: "decided",
							scope: approval.scope,
							text: `永久放行 ${approval.scope}`,
							source: "human",
						});
					}
					const line = always
						? `✅ 审批 ${target} 已批准并永久放行（${approval.scope}）。请重新执行刚才被拦截的动作。`
						: `✅ 审批 ${target} 已批准。请重新执行刚才被拦截的动作：${approval.tool_name}`;
					if (approval.scope?.startsWith("draft:")) {
						const draftId = approval.scope.slice("draft:".length);
						setDraftStatus(draftId, "approved", target);
						notify(`草稿 ${draftId} 已获批准，可以发送了（发送动作本身仍会被 L3 闸门拦一次）。`);
					}
					enqueueOutbox("decision", "summary", line);
					flushOutbox();
					notify(line);
					return;
				}
				const planId = target;
				const plan = getPlan(planId);
				if (!plan) {
					notify(`No such plan: ${planId}`, "error");
					return;
				}
				if (plan.status !== "awaiting_approval") {
					notify(`计划 ${planId} 当前状态 ${plan.status}，不需要批准。`, "warning");
					return;
				}
				const result = await approvePlanAndDispatch(planId, { cwd: ctx.cwd ?? process.cwd() });

				notify(
					[
						`计划 ${planId} 已批准，派发 ${result.dispatched.length}/${result.plan.steps.length} 步（后台执行）`,
						...result.dispatched.map((d) => `  ✅ ${d.step} → ${d.provider}/${d.jobId}`),
						...result.failed.map((f) => `  ❌ ${f.step}: ${f.error}`),
					].join("\n"),
				);
				return;
			}

			if (verb === "extend") {
				const target = rest[0] ?? "";
				const minutes = Number(rest[1] ?? 30);
				if (!target.startsWith("ap-")) {
					notify(`用法：/super extend <ap-id> [分钟]，例如 /super extend ${target} 60`, "error");
					return;
				}
				const result = extendApproval(target, Number.isFinite(minutes) ? minutes : 30);
				if (!result.ok) {
					notify(result.reason ?? "延期失败", "warning");
					return;
				}
				const until = result.approval?.expires_at.slice(11, 16) ?? "";
				notify(`⏳ 审批 ${target} 已延期到 ${until}（仍然需要你点头，卡本身没有被批准）。`);
				return;
			}

			if (verb === "run") {
				const action = rest[0];
				if (action === "start") {
					const minutes = Number(rest[1] ?? 360);
					const goalIndex = rest.findIndex((r) => r === "--goal");
					const goal = goalIndex >= 0 ? rest.slice(goalIndex + 1).join(" ") : "（未写目标）";
					const window = writeRunWindow({ goal, minutes: Number.isFinite(minutes) ? minutes : 360 });
					notify(`🎯 运行窗口已开：${goal}｜直到 ${window.until.slice(0, 16).replace("T", " ")}`);
					return;
				}
				if (action === "stop") {
					clearRunWindow();
					notify("运行窗口已关闭，机器不再自己说话。");
					return;
				}
				const current = readRunWindow();
				notify(
					current
						? `🎯 目标：${current.goal}｜直到 ${current.until.slice(0, 16).replace("T", " ")}`
						: "没有运行窗口（机器只会说必要的活）。",
				);
				return;
			}

			if (verb === "reject") {
				const target = rest[0] ?? "";
				const reason = rest.slice(1).filter((a) => a.toLowerCase() !== "always").join(" ");
				if (target.startsWith("ap-")) {
					const approval = getApproval(target);
					if (!approval) {
						notify(`No such approval: ${target}`, "error");
						return;
					}
					const scopeWide = rest.slice(1).some((a) => a.toLowerCase() === "always");
					const decision = decideApproval(target, "deny", "human");
					if (!decision.ok) {
						notify(decision.reason ?? "审批失败", "warning");
						return;
					}
					if (scopeWide && approval.scope) {
						addDecision({
							kind: "rejected",
							scope: approval.scope,
							text: `永久拒绝 ${approval.scope}${reason ? `：${reason}` : ""}`,
							source: "human",
						});
					}
					const line = `⛔ 审批 ${target} 被拒绝${reason ? `：${reason}` : ""}。不要再尝试这个动作。`;
					enqueueOutbox("decision", "summary", line);
					flushOutbox();
					notify(line);
					return;
				}
				const planId = target;
				const plan = getPlan(planId);
				if (!plan) {
					notify(`No such plan: ${planId}`, "error");
					return;
				}
				rejectPlanForHuman(planId, reason);
				notify(`计划 ${planId} 已拒绝，不会执行。`);
				return;
			}

			if (verb === "outbox") {
				const pending = pendingOutbox(20);
				const sent = flushOutbox();
				notify(
					pending.length
						? `待发 ${pending.length} 条，本次投递 ${sent} 条\n${pending.map((p) => `  [${p.kind}] ${p.payload.slice(0, 70)}`).join("\n")}`
						: `没有待发消息（本次投递 ${sent} 条）`,
				);
				return;
			}

			notify(
				"Usage: /super [tickets|ticket <id>|heartbeat [minutes]|budget|catalog|route <tag>|decisions|plan [id]|approvals|approve <plan-id|ap-id> [always]|reject <id> [always] [reason]|levels|audit|drafts|draft <id>|send <id>|discard <id>|sync|outbox]",
				"warning",
			);
		},
	});

	pi.on("session_start", async () => {
		const expired = expireStaleApprovals();
		if (expired.length) {
			enqueueOutbox("stream", "alert", `⌛ ${expired.length} 张审批卡过期（过期=未放行）：${expired.join(", ")}`);
		}
		// The recovery note: a restarted session knows where it left off.
		const note = writeResumeNote();
		if (note.verdict.stuck.length || note.panel.needsHuman.length) {
			enqueueOutbox("stream", "alert", `🐕 ${note.verdict.summary}\n${note.next.slice(0, 5).join("\n")}`);
		}
		flushOutbox();
	});

	// While the agent is idle, look at the phone: maybe the human answered.
	let lastSync = 0;
	pi.on("agent_settled", async () => {
		flushOutbox();
		if (!policy().channels.includes("dingtalk")) return;
		if (Date.now() - lastSync < 60_000) return;
		if (!pendingApprovals().length) return;
		lastSync = Date.now();
		await syncApprovalsFromDingtalk();
	});
}
