/**
 * Graded autonomy: every action has a level, and the level decides who may
 * let it happen.
 *
 *   L0 观察    只读、不留外部痕迹
 *   L1 起草    生成产物供人取用
 *   L2 可逆    能撤销的写操作
 *   L3 不可逆  发布 / 合并主干 / 花钱 / 对外 / 删数据 —— 必须人点头
 *
 * The rules live in rules.json, not in a model prompt: the router may not
 * decide what counts as irreversible.
 */

import { loadRules, type ApprovalRuleConfig } from "./catalog.ts";
import { findDecisionByScope } from "./ledger.ts";

export type Level = "L0" | "L1" | "L2" | "L3";

export interface ApprovalRule extends ApprovalRuleConfig {
	level: Level;
}

export interface ApprovalPolicy {
	defaultLevel: Level;
	expiresMinutes: number;
	channels: string[];
	rules: ApprovalRule[];
}

export interface Classification {
	level: Level;
	rule?: ApprovalRule;
	/** The scope an "always" answer is remembered under. */
	scope: string;
	/** The matched fragment, so the human sees why this was picked. */
	matched?: string;
	/** A remembered answer for this scope, if there is one. */
	remembered?: { kind: "decided" | "rejected"; text: string; scope: string };
	/** Standing rule: this class always needs a human, "always" cannot bypass it. */
	alwaysAsk?: boolean;
}

const LEVELS: Level[] = ["L0", "L1", "L2", "L3"];

export function policy(): ApprovalPolicy {
	const rules = loadRules();
	const approval = rules.approval ?? {};
	return {
		defaultLevel: (approval.defaultLevel as Level) ?? "L1",
		expiresMinutes: approval.expiresMinutes ?? 10,
		channels: approval.channels ?? ["session"],
		rules: (approval.rules ?? []) as ApprovalRule[],
	};
}

function isLevel(value: unknown): value is Level {
	return typeof value === "string" && (LEVELS as string[]).includes(value);
}

function textOf(input: Record<string, unknown>, field: string): string {
	const value = input[field];
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
	return "";
}

/** The first pattern that matches, and the text it matched. */
function matchPatterns(patterns: string[], value: string): { pattern: string; text: string } | undefined {
	for (const pattern of patterns) {
		if (value.includes(pattern)) return { pattern, text: pattern };
		try {
			const hit = new RegExp(pattern, "i").exec(value);
			if (hit) return { pattern, text: hit[0] };
		} catch {
			/* not a valid regex: treat as a plain substring */
		}
	}
	return undefined;
}

/* ------------------------------------------------- command position */

/**
 * Wrappers that may sit in front of the real command.
 */
const COMMAND_WRAPPERS = new Set([
	"sudo", "doas", "env", "time", "nice", "nohup", "command", "exec",
	"xargs", "then", "else", "do", "if", "while", "until",
]);

/**
 * Is the character range [start, start+len) inside a quoted string?
 * A quoted "rm -rf" is data, not a command — grepping for it must not be
 * treated as deleting something.
 */
function insideQuotes(command: string, start: number): boolean {
	let quote: string | null = null;
	for (let i = 0; i < start; i++) {
		const ch = command[i];
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") quote = ch;
	}
	return quote !== null;
}

/**
 * Does the command at [start, start+len) actually sit in command position?
 * "rm -rf x" does; "grep -n 'rm -rf' f" and "echo 'rm -rf'" do not.
 */
export function inCommandPosition(command: string, start: number): boolean {
	const before = command.slice(0, start);
	const trimmed = before.trimEnd();
	if (trimmed === "") return true;
	const last = trimmed.slice(-1);
	if (last === ";" || last === "&" || last === "|" || last === "\n" || last === "(" || last === "{" || last === "`") {
		return true;
	}
	// A wrapper word right before the command: "sudo rm -rf", "xargs rm".
	const lastWord = trimmed.split(/[\s]+/).pop() ?? "";
	if (COMMAND_WRAPPERS.has(lastWord.toLowerCase())) return true;
	return false;
}

/**
 * Shell wrappers whose -c argument is itself a command.
 * "bash -lc 'rm -rf x'" is a delete, even though rm sits inside quotes.
 */
const SHELL_WRAPPERS = /\b(?:ba|z|k|fi|da)?sh\b|\bpwsh\b|\bpowershell\b|\bcmd(?:\.exe)?\b/i;

/** The script a shell wrapper is asked to run, if any. */
function innerScript(command: string): string | undefined {
	const head = command.split(/\s+/).slice(0, 6).join(" ");
	if (!SHELL_WRAPPERS.test(head)) return undefined;
	// -c, -lc, --command, /c — the script is what follows the flag.
	const m = /(?:^|\s)(?:--command\b|\/[a-zA-Z]\b|-[a-zA-Z]*c[a-zA-Z]*)\s+([\s\S]+)$/i.exec(command);
	if (!m) return undefined;
	let script = m[1].trim();
	// The script may itself be wrapped in quotes: -c "rm -rf x"
	if ((script.startsWith('"') && script.endsWith('"')) || (script.startsWith("'") && script.endsWith("'"))) {
		script = script.slice(1, -1);
	}
	return script;
}

/**
 * The first match of a pattern that is really a command, and not text.
 *
 * Two reasons a hit is not a command: it sits inside quotes, or it sits in
 * the middle of another command's arguments. Both happen all the time with
 * read-only commands ("grep -n 'rm -rf'"), and treating those as L3 burns a
 * human's attention for nothing.
 */
function matchCommandPattern(pattern: string, command: string, depth = 0): { pattern: string; text: string } | undefined {
	const hit = matchInContext(pattern, command);
	if (hit) return hit;
	if (depth < 2) {
		const inner = innerScript(command);
		if (inner) return matchCommandPattern(pattern, inner, depth + 1);
	}
	return undefined;
}

function matchInContext(pattern: string, command: string): { pattern: string; text: string } | undefined {
	let regex: RegExp;
	try {
		regex = new RegExp(pattern, "gi");
	} catch {
		// Plain substring: the first occurrence has to be in command position.
		const index = command.indexOf(pattern);
		if (index < 0) return undefined;
		if (insideQuotes(command, index)) return undefined;
		if (!inCommandPosition(command, index)) return undefined;
		return { pattern, text: pattern };
	}
	let hit: RegExpExecArray | null;
	while ((hit = regex.exec(command)) !== null) {
		if (hit[0].length === 0) {
			regex.lastIndex++;
			continue;
		}
		if (insideQuotes(command, hit.index)) continue;
		if (!inCommandPosition(command, hit.index)) continue;
		return { pattern, text: hit[0] };
	}
	return undefined;
}

/**
 * Decides the level of one tool call.
 * The first matching rule wins; anything unmatched falls back to the default.
 */
export function classify(toolName: string, input: Record<string, unknown>): Classification {
	const p = policy();

	for (const rule of p.rules) {
		if (!isLevel(rule.level)) continue;
		if (rule.tool && rule.tool !== "*" && rule.tool !== toolName) continue;
		if (rule.toolPrefix && !toolName.startsWith(rule.toolPrefix)) continue;

		let matched: string | undefined;

		if (rule.commandContains || rule.commandMatches) {
			const command = textOf(input, "command");
			const patterns = [...(rule.commandContains ?? []), ...(rule.commandMatches ?? [])];
			let hit: { pattern: string; text: string } | undefined;
			for (const pattern of patterns) {
				hit = matchCommandPattern(pattern, command);
				if (hit) break;
			}
			if (!hit) continue;
			matched = hit.text;
		}
		if (rule.pathContains) {
			const paths = `${textOf(input, "path")} ${textOf(input, "file_path")} ${textOf(input, "filePath")}`;
			const hit = matchPatterns(rule.pathContains, paths);
			if (!hit) continue;
			matched = hit.text;
		}
		if (rule.field && rule.fieldContains) {
			const hit = matchPatterns(rule.fieldContains, textOf(input, rule.field));
			if (!hit) continue;
			matched = hit.text;
		}

		const scope = scopeFor(toolName, matched);
		return {
			level: rule.level,
			rule,
			scope,
			matched,
			remembered: rememberedFor(scope),
			alwaysAsk: rule.alwaysAsk === true,
		};
	}

	const scope = scopeFor(toolName);
	return { level: p.defaultLevel, scope, remembered: rememberedFor(scope) };
}

/** The scope an "always" answer is remembered under. */
export function scopeFor(toolName: string, matched?: string): string {
	return matched ? `tool:${toolName}:${matched}` : `tool:${toolName}`;
}

/** The remembered answer for a scope, if the human already gave one. */
export function rememberedFor(scope: string): { kind: "decided" | "rejected"; text: string; scope: string } | undefined {
	const decision = findDecisionByScope(scope);
	if (!decision) return undefined;
	return { kind: decision.kind === "rejected" ? "rejected" : "decided", text: decision.text, scope };
}

/** A one-line summary of a level, for the human. */
export function levelLabel(level: string): string {
	const entry = loadRules().levels?.[level];
	return entry?.label ? `${level} ${entry.label}` : level;
}
