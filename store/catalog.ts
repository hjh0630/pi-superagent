/**
 * Capability catalog + budget gate.
 *
 * rules.json is the machine-readable policy table (the "what may happen to
 * whom" contract). It is read here, not inferred by a model: a weak router
 * must never be free to pick the executor.
 *
 * Location: ~/.pi/agent/superagent/rules.json
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDb, today } from "./db.ts";

export interface LevelRule {
	label?: string;
	desc?: string;
}

export interface ApprovalRuleConfig {
	tool?: string;
	toolPrefix?: string;
	commandContains?: string[];
	commandMatches?: string[];
	pathContains?: string[];
	field?: string;
	fieldContains?: string[];
	level: string;
	desc?: string;
	/**
	 * Standing "ask first": this class of action always needs a human, even if
	 * someone once chose "always". Grok Bot's rule: when Ask first and Allow
	 * automatically both match, Ask first wins.
	 */
	alwaysAsk?: boolean;
}

export interface ProviderRule {
	/** 1 = API level (fast, cheap, parallel), 2 = CLI level (can touch files). */
	tier?: 1 | 2;
	/** Capability tags this provider can serve. */
	caps?: string[];
	/** Daily call ceiling. */
	maxCallsPerDay?: number;
	/** Daily wall-clock ceiling in minutes. */
	maxMinutesPerDay?: number;
	/** Whether runs of this provider need human approval. */
	needsApproval?: boolean;
	/** Paused providers are never routed to (no account, no key, dead relay...). */
	paused?: boolean;
	/** Why it is paused. */
	note?: string;
}

export interface RouteRule {
	/** Capability tag to serve. */
	tag?: string;
	/** Preferred providers, strongest first. */
	prefer?: string[];
	/** Allowed when the preferred ones are unavailable. */
	fallback?: string[];
}

export interface Rules {
	version: number;
	defaults: { maxCallsPerDay: number; maxMinutesPerDay: number };
	providers: Record<string, ProviderRule>;
	routes: RouteRule[];
	/** Named roles: the "bots" that do the work (design, seo, social...). */
	roles?: Record<string, { provider?: string; label?: string; brief?: string }>;
	/** M2: graded autonomy. */
	levels?: Record<string, LevelRule>;
	approval?: {
		defaultLevel?: string;
		expiresMinutes?: number;
		channels?: string[];
		rules?: ApprovalRuleConfig[];
	};
}

export function rulesPath(): string {
	return join(AGENT_HOME, "superagent", "rules.json");
}

const DEFAULT_RULES: Rules = {
	version: 2,
	defaults: { maxCallsPerDay: 40, maxMinutesPerDay: 120 },
	levels: {
		L0: { label: "观察", desc: "只读、不留外部痕迹" },
		L1: { label: "起草", desc: "生成产物供人取用" },
		L2: { label: "可逆", desc: "能撤销的写操作" },
		L3: { label: "不可逆", desc: "发布/合并主干/花钱/对外/删数据 —— 必须人点头" },
	},
	approval: {
		defaultLevel: "L1",
		expiresMinutes: 10,
		channels: ["session", "dingtalk"],
		rules: [
			{ tool: "bash", commandMatches: ["\\bgit\\s+push\\b", "\\brm\\s+-[a-z]*r", "\\bnpm\\s+publish\\b"], level: "L3", desc: "推送/发布/删除" },
			{ tool: "write", level: "L2" },
			{ tool: "edit", level: "L2" },
			{ tool: "read", level: "L0" },
		],
	},
	providers: {
		pi: { tier: 1, caps: ["general", "research", "bulk-edit"], maxCallsPerDay: 60, maxMinutesPerDay: 90 },
		gemini: { tier: 2, caps: ["research", "bulk-edit", "general"], maxCallsPerDay: 20, maxMinutesPerDay: 60 },
		grok: { tier: 2, caps: ["code-review", "research", "pr"], maxCallsPerDay: 20, maxMinutesPerDay: 60 },
		codex: { tier: 2, caps: ["code", "refactor", "pr", "test"], maxCallsPerDay: 30, maxMinutesPerDay: 120 },
		claude: { tier: 2, caps: ["code", "review"], maxCallsPerDay: 30, maxMinutesPerDay: 120 },
	},
	routes: [
		{ tag: "code", prefer: ["codex", "claude"], fallback: ["pi"] },
		{ tag: "review", prefer: ["claude", "grok"], fallback: ["pi"] },
		{ tag: "code-review", prefer: ["grok", "claude"], fallback: ["pi"] },
		{ tag: "research", prefer: ["pi", "grok"], fallback: [] },
		{ tag: "general", prefer: ["pi"], fallback: [] },
	],
};

export function loadRules(): Rules {
	const path = rulesPath();
	if (!existsSync(path)) return DEFAULT_RULES;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Rules;
		return {
			version: parsed.version ?? 1,
			defaults: { ...DEFAULT_RULES.defaults, ...(parsed.defaults ?? {}) },
			providers: { ...DEFAULT_RULES.providers, ...(parsed.providers ?? {}) },
			routes: parsed.routes ?? DEFAULT_RULES.routes,
			levels: { ...DEFAULT_RULES.levels, ...(parsed.levels ?? {}) },
			approval: {
				...DEFAULT_RULES.approval,
				...(parsed.approval ?? {}),
				rules: parsed.approval?.rules ?? DEFAULT_RULES.approval?.rules,
			},
			roles: { ...(DEFAULT_RULES.roles ?? {}), ...(parsed.roles ?? {}) },
		};
	} catch {
		return DEFAULT_RULES;
	}
}

/** Providers that may serve a tag, strongest first, according to the rules. */
export function routeFor(tag: string): string[] {
	const rules = loadRules();
	for (const route of rules.routes) {
		if (route.tag !== tag) continue;
		const all = [...(route.prefer ?? []), ...(route.fallback ?? [])];
		// A paused provider is never routed to: no account, no key, dead relay.
		return all.filter((id) => !rules.providers[id]?.paused);
	}
	return [];
}

export interface BudgetState {
	day: string;
	provider: string;
	calls: number;
	seconds: number;
	maxCalls: number;
	maxMinutes: number;
}

export function budgetFor(provider: string): BudgetState {
	const rules = loadRules();
	const rule = rules.providers[provider];
	const row = getDb()
		.prepare("SELECT calls, seconds FROM budget WHERE day = ? AND provider = ?")
		.get(today(), provider) as { calls: number; seconds: number } | undefined;
	return {
		day: today(),
		provider,
		calls: row?.calls ?? 0,
		seconds: row?.seconds ?? 0,
		maxCalls: rule?.maxCallsPerDay ?? rules.defaults.maxCallsPerDay,
		maxMinutes: rule?.maxMinutesPerDay ?? rules.defaults.maxMinutesPerDay,
	};
}

/** True when the provider may take another call today. */
export function withinBudget(provider: string): { ok: boolean; reason?: string; state: BudgetState } {
	const state = budgetFor(provider);
	if (state.calls >= state.maxCalls) {
		return { ok: false, reason: `daily call cap reached (${state.calls}/${state.maxCalls})`, state };
	}
	if (state.seconds >= state.maxMinutes * 60) {
		return { ok: false, reason: `daily time cap reached (${Math.round(state.seconds / 60)}/${state.maxMinutes} min)`, state };
	}
	return { ok: true, state };
}

export function recordSpend(provider: string, seconds: number): void {
	getDb()
		.prepare(
			`INSERT INTO budget (day, provider, calls, seconds) VALUES (?, ?, 1, ?)
			 ON CONFLICT(day, provider) DO UPDATE SET calls = calls + 1, seconds = seconds + excluded.seconds`,
		)
		.run(today(), provider, Math.max(0, Math.round(seconds)));
}

/**
 * How a provider behaved lately.
 * The routing table decides who may serve a tag; this only decides who to try
 * first among the allowed ones (a CLI that is blocked by the network should
 * not be the first try every time).
 */
export interface ProviderHealth {
	provider: string;
	runs: number;
	failures: number;
	lastStatus?: string;
	/** Higher is healthier. */
	score: number;
}

export function providerHealth(provider: string, window = 10): ProviderHealth {
	const rows = getDb()
		.prepare("SELECT status FROM assignments WHERE provider = ? ORDER BY started_at DESC LIMIT ?")
		.all(provider, window) as { status: string }[];
	const runs = rows.length;
	const failures = rows.filter((r) => r.status !== "succeeded").length;
	const lastStatus = rows[0]?.status;
	// A provider that has never run is unknown, not proven: rank it below one
	// that has actually delivered, so a blocked CLI is not the first try.
	const score = runs === 0 ? 0.4 : (runs - failures) / runs;
	return { provider, runs, failures, lastStatus, score };
}
