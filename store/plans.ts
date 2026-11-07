/**
 * Plan windows: approve, then dispatch.
 *
 * The approval and the dispatch live together so both the slash command and
 * the smoke test use exactly the same path. A plan only runs after a human
 * said yes — there is no code path that dispatches a plan without one.
 */

import { getProvider } from "../providers/registry.ts";
import { composeTask, resolveExecutor } from "./roles.ts";
import { readJob } from "./jobs.ts";
import { routeFor, withinBudget } from "./catalog.ts";
import {
	addDecision,
	approvePlan,
	getPlan,
	rejectPlan,
	setPlanStatus,
	updatePlanSteps,
	type Plan,
	type PlanStep,
} from "./ledger.ts";
import { dispatch } from "./runner.ts";

export interface DispatchedStep {
	step: string;
	provider: string;
	jobId: string;
}

export interface FailedStep {
	step: string;
	error: string;
}

/** Picks the executor for a step: role, then explicit provider, then the route. */
export function pickExecutor(step: PlanStep): string {
	if (step.role) return resolveExecutor(step.role).executor;
	if (step.provider) return step.provider;
	const tag = step.tag ?? "general";
	const candidates = routeFor(tag);
	if (!candidates.length) throw new Error(`No route for tag "${tag}". Add one to rules.json.`);
	for (const id of candidates) {
		const budget = withinBudget(id);
		if (budget.ok && getProvider(id)) return id;
	}
	throw new Error(`No executor available for tag "${tag}": ${candidates.join(", ")} (all out of budget or unknown)`);
}

/**
 * The human approved: dispatch every step in the background.
 * Steps run independently; a failing step does not stop the others.
 */
export async function approvePlanAndDispatch(
	planId: string,
	opts: { cwd: string; decidedBy?: string },
): Promise<{ plan: Plan; dispatched: DispatchedStep[]; failed: FailedStep[] }> {
	const plan = getPlan(planId);
	if (!plan) throw new Error(`No such plan: ${planId}`);
	if (plan.status !== "awaiting_approval") throw new Error(`Plan ${planId} is ${plan.status}, not awaiting approval`);

	const decidedBy = opts.decidedBy ?? "human";
	approvePlan(planId, decidedBy);
	addDecision({
		kind: "decided",
		scope: `plan:${planId}`,
		text: `批准计划 ${planId}（${plan.title}），${plan.steps.length} 步`,
		source: decidedBy,
	});

	const dispatched: DispatchedStep[] = [];
	const failed: FailedStep[] = [];
	for (const step of plan.steps) {
		try {
			// A step that depends on others waits for their jobs to finish:
			// reviewing code that is not written yet is reviewing nothing.
			await waitForDependencies(step, plan.id);

			const provider = pickExecutor(step);
			const role = step.role ? resolveExecutor(step.role) : undefined;
			const outcome = await dispatch({
				provider,
				task: role ? composeTask(role, step.task) : step.task,
				cwd: opts.cwd,
				ticketId: plan.ticket_id ?? undefined,
				planId: plan.id,
				background: true,
				dedupe: false,
			});
			step.jobId = outcome.jobId;
			step.status = "dispatched";
			dispatched.push({ step: step.id, provider, jobId: outcome.jobId });
		} catch (err) {
			step.status = "failed";
			failed.push({ step: step.id, error: err instanceof Error ? err.message : String(err) });
		}
	}
	updatePlanSteps(plan.id, plan.steps);
	if (dispatched.length) setPlanStatus(plan.id, "running");
	else if (failed.length) setPlanStatus(plan.id, "failed");
	return { plan: getPlan(planId) ?? plan, dispatched, failed };
}

/**
 * Waits until every dependency step's job reached a terminal state.
 * Steps without dependencies never wait.
 */
export async function waitForDependencies(step: PlanStep, planId: string, timeoutMs = 1_800_000): Promise<void> {
	const deps = step.dependsOn ?? [];
	if (!deps.length) return;
	const deadline = Date.now() + timeoutMs;
	const pending = new Set(deps);
	while (pending.size && Date.now() < deadline) {
		for (const dep of [...pending]) {
			const plan = getPlan(planId);
			const depStep = plan?.steps.find((s) => s.id === dep);
			const job = depStep?.jobId ? readJob(depStep.jobId) : undefined;
			if (!job || job.status === "succeeded" || job.status === "failed" || job.status === "timeout" || job.status === "cancelled" || job.status === "orphaned") {
				pending.delete(dep);
			}
		}
		if (!pending.size) return;
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
}

/** The human said no: nothing runs, and the decision is remembered. */
export function rejectPlanForHuman(planId: string, reason?: string): Plan | undefined {
	const plan = getPlan(planId);
	if (!plan) throw new Error(`No such plan: ${planId}`);
	rejectPlan(planId, "human");
	addDecision({
		kind: "rejected",
		scope: `plan:${planId}`,
		text: `拒绝计划 ${planId}（${plan.title}）${reason ? `：${reason}` : ""}`,
		source: "human",
	});
	return getPlan(planId);
}
