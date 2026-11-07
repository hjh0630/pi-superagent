import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { ProviderSpec } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** The pi version this provider will actually start. */
function piVersion(): string {
	try {
		const npmRoot = process.env.APPDATA ? join(process.env.APPDATA, "npm") : join(homedir(), ".npm-global");
		const pkg = join(npmRoot, "node_modules", "@earendil-works", "pi-coding-agent", "package.json");
		return (JSON.parse(readFileSync(pkg, "utf8")) as { version?: string }).version ?? "?";
	} catch {
		return "?";
	}
}

/**
 * pi itself as a provider — a second, independent Pi runtime with its own
 * model (MiniMax on this machine) reached over the RPC protocol.
 *
 * Useful as the always-available member of the fleet: a second opinion from a
 * different vendor without touching any other CLI's account.
 */
export const pi: ProviderSpec = {
	id: "pi",
	label: "Pi (second runtime)",
	bin: { nodeScript: join(here, "pi-runner.mjs") },
	version: piVersion(),
	capabilities: { general: 3, research: 2, "bulk-edit": 2 },
	buildArgs({ prompt, cwd, model }) {
		// 40 minutes: a slow model reviewing a large repo needs more than the
		// default 15, or the child hits its own timeout mid-analysis.
		const args = ["--prompt", prompt, "--cwd", cwd, "--timeout", "2400000"];
		if (model) args.push("--model", model);
		return args;
	},
	parseOutput(stdout) {
		return { text: stdout.trim() };
	},
};
