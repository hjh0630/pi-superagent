import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderSpec } from "./types.ts";
import { findOnPath } from "./resolve.ts";

/**
 * codex CLI (0.146.0-alpha.3.1 on this machine).
 *   codex exec <prompt> --dangerously-bypass-approvals-and-sandbox -C <cwd> [-m <model>]
 *
 * The binary lives in ~/.codex/.sandbox-bin and is NOT on PATH, so the
 * absolute path is resolved here.
 */
function resolveCodex(): string {
	const exe = join(homedir(), ".codex", ".sandbox-bin", "codex.exe");
	if (existsSync(exe)) return exe;
	return findOnPath("codex") ?? "codex";
}

export const codex: ProviderSpec = {
	id: "codex",
	label: "Codex CLI",
	bin: resolveCodex(),
	version: "0.146.0-alpha.3.1",
	capabilities: { code: 5, refactor: 4, pr: 4, test: 3 },
	buildArgs({ prompt, cwd, model }) {
		const args = ["exec", prompt, "--dangerously-bypass-approvals-and-sandbox", "-C", cwd];
		if (model) args.push("-m", model);
		return args;
	},
	parseOutput(stdout) {
		return { text: stdout.trim() };
	},
};
