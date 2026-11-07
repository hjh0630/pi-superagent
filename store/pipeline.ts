/**
 * The five-step acceptance pipeline.
 *
 *   1 审查  read-only review, at most 3 rounds
 *   2 检查  checks (tests / build) — evidence: exit code + output tail
 *   3 合并  merge to main      — L3: needs a human
 *   4 发布  publish             — L3: needs a human
 *   5 核实  verify the result   — evidence, not self-report
 *
 * Rules:
 *   - every step writes evidence; a step without evidence did not happen;
 *   - merge and publish never run without an approval card, and in dry-run
 *     mode they are only recorded as "would run";
 *   - the review stops after 3 rounds even if the reviewer keeps talking.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { getDb, logEvent, nowIso } from "./db.ts";
import { createApproval, approvalCard } from "./approvals.ts";
import { enqueueOutbox } from "./ledger.ts";
import { sendApprovalCard } from "./channels/dingtalk.ts";
import { dispatch } from "./runner.ts";
import { routeFor, withinBudget, providerHealth } from "./catalog.ts";
import { getProvider } from "../providers/registry.ts";
import { onlyProvider } from "./roles.ts";

export type StepName = "review" | "check" | "merge" | "publish" | "verify";
export type StepStatus = "pending" | "running" | "done" | "failed" | "blocked" | "skipped" | "planned";

export interface StepEvidence {
	/** What the step claims to have done. */
	action: string;
	/** How we know it worked: commands, exit codes, files, urls. */
	evidence: Record<string, unknown>;
	/** The raw output an auditor can read. */
	logPath?: string;
	ok: boolean;
}

export interface VerificationStep {
	name: StepName;
	label: string;
	status: StepStatus;
	rounds: StepEvidence[];
	startedAt?: string;
	endedAt?: string;
}

export interface VerificationRun {
	id: string;
	ticket_id: string | null;
	cwd: string;
	dry_run: boolean;
	status: "running" | "done" | "blocked" | "failed";
	steps: VerificationStep[];
	created_at: string;
	ended_at?: string;
}

interface RunRow {
	id: string;
	ticket_id: string | null;
	cwd: string;
	dry_run: number;
	status: string;
	steps: string | null;
	created_at: string;
	ended_at: string | null;
}

function id(prefix: string): string {
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
	const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
	return `${prefix}-${stamp}-${rand}`;
}

const STEP_LABELS: Record<StepName, string> = {
	review: "只读审查（≤3 轮）",
	check: "检查（测试/构建）",
	merge: "合并主干",
	publish: "发布",
	verify: "核实（结果复验）",
};

export const FIVE_STEPS: StepName[] = ["review", "check", "merge", "publish", "verify"];

/* ------------------------------------------------------------------ storage */

export function createRun(input: { ticketId?: string; cwd: string; dryRun: boolean }): VerificationRun {
	const run: VerificationRun = {
		id: id("vr"),
		ticket_id: input.ticketId ?? null,
		cwd: input.cwd,
		dry_run: input.dryRun,
		status: "running",
		steps: FIVE_STEPS.map((name) => ({ name, label: STEP_LABELS[name], status: "pending", rounds: [] })),
		created_at: nowIso(),
	};
	getDb()
		.prepare(
			`INSERT INTO verifications (id, ticket_id, cwd, dry_run, status, steps, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(run.id, run.ticket_id, run.cwd, run.dry_run ? 1 : 0, run.status, JSON.stringify(run.steps), run.created_at);
	logEvent("verification.created", { cwd: run.cwd, dryRun: run.dry_run }, run.ticket_id ?? undefined);
	return run;
}

export function saveRun(run: VerificationRun): void {
	getDb()
		.prepare("UPDATE verifications SET status = ?, steps = ?, ended_at = ? WHERE id = ?")
		.run(run.status, JSON.stringify(run.steps), run.ended_at ?? null, run.id);
}

export function getRun(runId: string): VerificationRun | undefined {
	const row = getDb().prepare("SELECT * FROM verifications WHERE id = ?").get(runId) as RunRow | undefined;
	if (!row) return undefined;
	let steps: VerificationStep[] = [];
	try {
		steps = row.steps ? (JSON.parse(row.steps) as VerificationStep[]) : [];
	} catch {
		steps = [];
	}
	return {
		id: row.id,
		ticket_id: row.ticket_id,
		cwd: row.cwd,
		dry_run: row.dry_run === 1,
		status: row.status as VerificationRun["status"],
		steps,
		created_at: row.created_at,
		ended_at: row.ended_at ?? undefined,
	};
}

export function listRuns(limit = 10): VerificationRun[] {
	const rows = getDb()
		.prepare("SELECT id FROM verifications ORDER BY created_at DESC LIMIT ?")
		.all(limit) as { id: string }[];
	return rows.map((r) => getRun(r.id)).filter((r): r is VerificationRun => Boolean(r));
}

/* ------------------------------------------------------------------ helpers */

function logPath(runId: string, name: string): string {
	return `~/.pi/agent/fleet/verifications/${runId}/${name}.log`;
}

/** Reads a review evidence pack (bounded, so the prompt cannot explode). */
function readEvidence(path: string): string | undefined {
	try {
		if (!existsSync(path)) return undefined;
		return readFileSync(path, "utf8").slice(0, 24_000);
	} catch {
		return undefined;
	}
}

interface CommandResult {
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

/** Runs one command in the given directory and returns its evidence. */
export function runCommand(command: string, cwd: string, timeoutMs = 600_000): Promise<CommandResult> {
	return new Promise((resolve) => {
		const child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
			cwd,
			shell: false,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {
				/* already gone */
			}
		}, timeoutMs);
		child.stdout?.on("data", (c: Buffer) => {
			stdout += c.toString("utf8");
		});
		child.stderr?.on("data", (c: Buffer) => {
			stderr += c.toString("utf8");
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			resolve({ code: null, stdout, stderr: stderr + `\n${err.message}`, timedOut: false });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr, timedOut: false });
		});
	});
}

/** The reviewer candidates for the review step: the routes, ordered by health. */
export function reviewerCandidates(): string[] {
	const forced = onlyProvider();
	if (forced) return [forced];
	const candidates = [...routeFor("code-review"), ...routeFor("review"), ...routeFor("general")];
	const unique = [...new Set(candidates)];
	const usable = unique.filter((id) => getProvider(id) && withinBudget(id).ok);
	return usable.sort((a, b) => providerHealth(b).score - providerHealth(a).score);
}

/** The reviewer for the review step: the code-review route, else anything alive. */
export function pickReviewer(): string {
	const candidates = reviewerCandidates();
	if (!candidates.length) {
		throw new Error("No reviewer available (route code-review → review → general is empty or over budget)");
	}
	return candidates[0];
}

/* ------------------------------------------------------------------ pipeline */

export interface PipelineInput {
	cwd: string;
	ticketId?: string;
	/** Commands for the check step (tests / build). */
	checks?: string[];
	/** Review rounds, capped at 3. */
	reviewRounds?: number;
	/** The exact command for the merge step (L3). */
	mergeCommand?: string;
	/** The exact command for the publish step (L3). */
	publishCommand?: string;
	/** The exact command for the verify step. */
	verifyCommand?: string;
	/** Record what would happen; execute nothing irreversible. */
	dryRun?: boolean;
	/** Provider for the review rounds. */
	reviewer?: string;
	/**
	 * A file with already-collected review evidence. When present the
	 * reviewer judges this instead of exploring the repository — slow models
	 * otherwise burn their whole budget reading files.
	 */
	reviewEvidenceFile?: string;
}

export interface PipelineResult {
	run: VerificationRun;
	/** Approval cards created for the irreversible steps. */
	approvals: string[];
	/** Human-readable report. */
	report: string;
}

/**
 * Runs the five steps.
 * Merge and publish stop at an approval card — the human releases them, and
 * the agent then re-issues the exact command (which the gate lets through).
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
	const cwd = input.cwd;
	if (!existsSync(cwd)) throw new Error(`Working directory does not exist: ${cwd}`);

	const run = createRun({ ticketId: input.ticketId, cwd, dryRun: input.dryRun === true });
	const approvals: string[] = [];

	// 1 · review (read-only, at most 3 rounds)
	const reviewStep = run.steps[0];
	reviewStep.status = "running";
	reviewStep.startedAt = nowIso();
	try {
		const reviewers = input.reviewer
			? [input.reviewer, ...reviewerCandidates().filter((id) => id !== input.reviewer)]
			: reviewerCandidates();
		if (!reviewers.length) throw new Error("No reviewer available (route code-review → review → general is empty or over budget)");
		const rounds = Math.max(1, Math.min(3, input.reviewRounds ?? 1));
		// A reviewer that has to explore a whole repo can burn its whole budget
		// reading files. When an evidence pack is provided, judge that instead.
		const evidence = input.reviewEvidenceFile ? readEvidence(input.reviewEvidenceFile) : undefined;
		for (let round = 1; round <= rounds; round++) {
			let lastEvidence: Record<string, unknown> = { error: "no reviewer tried" };
			let lastOk = false;
			let lastProvider = reviewers[0];
			for (const provider of reviewers) {
				const outcome = await dispatch({
					provider,
					task: evidence
						? `发布前评审。**不要翻仓库、不要跑命令**，只依据下面这份机器采集的证据包判断。
证据包（docs/verify-evidence.md）：
${evidence}

判定口径分开说：
A. **代码/内容必须先修项**（错误实体类型、编造声明与无出处数字、错误结构化数据、meta/canonical 缺失或占位、面包屑错、分享图格式或占位、TODO 残留、表单没接后端、PII 进 URL、NAP 多份拷贝等）→ 逐条列出并给定位；没有就明确说"代码层面无阻塞项"。
B. **上线闸门**（NAP 仍是占位）→ 人工事项，部署前由人填真值；确认它不构成代码缺陷即可。
C. 最终结论：代码"可以合并"或"不能合并，必须先修 N 项"。
把结论写进 ${cwd}/docs/review-final.md。`
						: `只读审查目录 ${cwd} 的当前改动。不要修改任何文件。` +
							`第 ${round}/${rounds} 轮：列出你认为必须先解决的问题；如果没有必须先解决的问题，回复“可以合并”。`,
					cwd,
					ticketId: input.ticketId,
					dedupe: false,
					timeoutMs: provider === "pi" ? 2_700_000 : 900_000,
				});
				const text = outcome.output?.trim() ?? "";
				lastProvider = provider;
				lastOk = outcome.status === "succeeded";
				lastEvidence = {
					provider,
					round,
					exitCode: outcome.exitCode,
					jobId: outcome.jobId,
					status: outcome.status,
					summary: text.slice(0, 600),
				};
				if (lastOk) break;
			}
			reviewStep.rounds.push({
				action: `第 ${round} 轮只读审查（${lastProvider}）`,
				evidence: lastEvidence,
				ok: lastOk,
			});
			if (lastOk && /可以合并|没有必须先解决|无阻塞/.test(String(lastEvidence.summary ?? ""))) break;
		}
		reviewStep.status = reviewStep.rounds.every((r) => r.ok) ? "done" : "failed";
	} catch (err) {
		reviewStep.status = "failed";
		reviewStep.rounds.push({
			action: "只读审查",
			evidence: { error: err instanceof Error ? err.message : String(err) },
			ok: false,
		});
	}
	reviewStep.endedAt = nowIso();

	// 2 · check (tests / build)
	const checkStep = run.steps[1];
	checkStep.status = "running";
	checkStep.startedAt = nowIso();
	for (const command of input.checks ?? []) {
		const result = await runCommand(command, cwd);
		checkStep.rounds.push({
			action: command,
			evidence: { command, exitCode: result.code, ok: result.code === 0, outputTail: result.stdout.slice(-800) },
			logPath: logPath(run.id, "check"),
			ok: result.code === 0,
		});
	}
	checkStep.status = checkStep.rounds.length === 0 ? "skipped" : checkStep.rounds.every((r) => r.ok) ? "done" : "failed";
	checkStep.endedAt = nowIso();

	// 3 + 4 · merge and publish: L3, never without a human
	const irreversible: { step: VerificationStep; command?: string; what: string }[] = [
		{ step: run.steps[2], command: input.mergeCommand, what: "合并主干" },
		{ step: run.steps[3], command: input.publishCommand, what: "发布" },
	];
	for (const item of irreversible) {
		if (!item.command) {
			item.step.status = "skipped";
			continue;
		}
		if (input.dryRun) {
			item.step.status = "planned";
			item.step.rounds.push({
				action: `dry-run：计划执行 ${item.what}`,
				evidence: { command: item.command, dryRun: true },
				ok: true,
			});
			continue;
		}
		const approval = createApproval({
			title: `${item.what}: ${item.command}`,
			detail: `五步验收 ${run.id} · 第 ${FIVE_STEPS.indexOf(item.step.name) + 1} 步`,
			level: "L3",
			scope: `tool:bash:${item.command}`,
			toolName: "bash",
			args: { command: item.command },
			ticketId: input.ticketId,
			channel: "session",
			expiresMinutes: 30,
		});
		approvals.push(approval.id);
		item.step.status = "blocked";
		item.step.rounds.push({
			action: `${item.what}（等人工批准）`,
			evidence: { approvalId: approval.id, code: approval.code, command: item.command, expiresAt: approval.expires_at },
			ok: false,
		});
		enqueueOutbox("decision", "alert", approvalCard(approval));
		await sendApprovalCard(approval);
	}

	// 5 · verify (evidence, not self-report)
	const verifyStep = run.steps[4];
	if (input.verifyCommand) {
		verifyStep.status = "running";
		verifyStep.startedAt = nowIso();
		const result = await runCommand(input.verifyCommand, cwd);
		verifyStep.rounds.push({
			action: input.verifyCommand,
			evidence: { command: input.verifyCommand, exitCode: result.code, ok: result.code === 0, outputTail: result.stdout.slice(-800) },
			logPath: logPath(run.id, "verify"),
			ok: result.code === 0,
		});
		verifyStep.status = result.code === 0 ? "done" : "failed";
		verifyStep.endedAt = nowIso();
	} else {
		verifyStep.status = "skipped";
	}

	run.status = approvals.length ? "blocked" : run.steps.some((s) => s.status === "failed") ? "failed" : "done";
	run.ended_at = nowIso();
	saveRun(run);
	logEvent("verification.finished", { status: run.status, approvals }, run.ticket_id ?? undefined);

	return { run, approvals, report: formatRun(run) };
}

/** The report the human reads — one line per step, evidence included. */
export function formatRun(run: VerificationRun): string {
	const lines = [
		`🧪 五步验收 ${run.id}${run.dry_run ? "（dry-run）" : ""}`,
		`目录：${run.cwd}｜状态：${run.status}`,
	];
	for (const step of run.steps) {
		lines.push(`— ${step.label} · ${step.status}`);
		for (const round of step.rounds) {
			const summary = (round.evidence.summary ?? round.evidence.outputTail ?? round.evidence.error ?? "") as string;
			lines.push(
				`    ${round.ok ? "✅" : "⛔"} ${round.action}${summary ? ` — ${summary.split("\n")[0].slice(0, 110)}` : ""}`,
			);
			if (round.evidence.approvalId) {
				lines.push(`       审批卡 ${round.evidence.approvalId}（${round.evidence.code}）→ /super approve ${round.evidence.approvalId}`);
			}
		}
	}
	return lines.join("\n");
}

/** A stable id for one command, used to recognise "the same action". */
export function commandHash(command: string): string {
	return createHash("sha256").update(command).digest("hex").slice(0, 32);
}
