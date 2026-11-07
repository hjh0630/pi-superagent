import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProviderSpec } from "./types.ts";
import { npmGlobalRoot } from "./resolve.ts";

/**
 * gemini CLI (0.46.0 on this machine).
 *   gemini -p <prompt> --yolo [-m <model>]
 * The npm shim is gemini.cmd; the real entry is a node script, so we run that
 * directly to keep argument quoting intact.
 */
function resolveGemini(): string | { nodeScript: string } {
	const script = join(npmGlobalRoot(), "node_modules", "@google", "gemini-cli", "bundle", "gemini.js");
	if (existsSync(script)) return { nodeScript: script };
	return "gemini";
}

export const gemini: ProviderSpec = {
	id: "gemini",
	label: "Gemini CLI",
	bin: resolveGemini(),
	version: "0.46.0",
	capabilities: { research: 3, "bulk-edit": 3, general: 2 },
	envAllow: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
	buildArgs({ prompt, model }) {
		const args = ["-p", prompt, "--yolo"];
		if (model) args.push("-m", model);
		return args;
	},
	parseOutput(stdout) {
		// gemini prints the final answer as plain text on stdout.
		return { text: stdout.trim() };
	},
};
