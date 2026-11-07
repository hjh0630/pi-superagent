import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProviderSpec } from "./types.ts";

/**
 * Antigravity CLI (Google, 1.4.12 on this machine).
 *
 *   agy -p <prompt> --output-format text --effort <lvl> [--model <m>] [--dangerously-skip-permissions]
 *
 * The official Gemini CLI is retired for individuals ("This client is no
 * longer supported for Gemini Code Assist for individuals"), but Antigravity
 * is Google's current agentic client and exposes several models:
 * gemini-3.8-flash-{low,medium,high}, claude-sonnet-4-6, claude-opus-4-6-thinking,
 * gpt-oss-120b-medium.
 *
 * It has no --cwd flag, so fleet always spawns it with an explicit cwd.
 */
function resolveAgy(): string {
	const candidates = [
		"D:\\ai\\Antigravity CLI\\agy.exe",
		join(process.env.LOCALAPPDATA ?? "", "Programs", "antigravity", "agy.exe"),
	];
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	return "agy";
}

export const antigravity: ProviderSpec = {
	id: "antigravity",
	label: "Antigravity CLI (Google)",
	bin: resolveAgy(),
	version: "1.4.12",
	capabilities: { research: 4, "bulk-edit": 4, general: 3, code: 3, review: 3 },
	buildArgs({ prompt, model }) {
		const args = ["-p", prompt, "--output-format", "text", "--effort", "medium", "--dangerously-skip-permissions"];
		if (model) args.push("--model", model);
		return args;
	},
	parseOutput(stdout) {
		return { text: stdout.trim() };
	},
};
