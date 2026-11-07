import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProviderSpec } from "./types.ts";
import { npmGlobalRoot } from "./resolve.ts";

/**
 * claude CLI (2.1.228 on this machine).
 *   claude -p <prompt> --dangerously-skip-permissions [--model <model>]
 *
 * The npm shim points at a native claude.exe, which we spawn directly.
 */
function resolveClaude(): string {
	const exe = join(npmGlobalRoot(), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
	if (existsSync(exe)) return exe;
	return "claude";
}

export const claude: ProviderSpec = {
	id: "claude",
	label: "Claude Code CLI",
	bin: resolveClaude(),
	version: "2.1.228",
	capabilities: { code: 5, review: 4 },
	envAllow: ["ANTHROPIC_API_KEY"],
	buildArgs({ prompt, model }) {
		const args = ["-p", prompt, "--dangerously-skip-permissions"];
		if (model) args.push("--model", model);
		return args;
	},
	parseOutput(stdout) {
		return { text: stdout.trim() };
	},
};
