import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderSpec } from "./types.ts";
import { npmGlobalRoot } from "./resolve.ts";

/**
 * grok CLI (0.2.112 on this machine).
 *   grok --cwd <cwd> --output-format json --always-approve --max-turns N -p "<prompt>"
 *
 * Note: grok's kernel-level sandbox (Landlock/Seatbelt) does not exist on
 * Windows — it only warns and continues. Isolation here is the caller's job
 * (explicit cwd), the tool allowlist below is defence in depth.
 */
function resolveGrok(): string {
	const exe = join(homedir(), ".grok", "bin", "grok");
	if (existsSync(exe)) return exe;
	return "grok";
}

/** Best-effort extraction from grok's JSON output. */
function extractText(stdout: string): string {
	const trimmed = stdout.trim();
	if (!trimmed) return "";

	// Whole payload is one JSON document.
	try {
		const doc = JSON.parse(trimmed);
		const text = textFromValue(doc);
		if (text) return text;
	} catch {
		// fall through to line-by-line parsing
	}

	// Otherwise it may be JSON lines.
	const chunks: string[] = [];
	for (const line of trimmed.split(/\r?\n/)) {
		const t = line.trim();
		if (!t.startsWith("{")) {
			if (t) chunks.push(t);
			continue;
		}
		try {
			const doc = JSON.parse(t);
			const text = textFromValue(doc);
			if (text) chunks.push(text);
		} catch {
			chunks.push(t);
		}
	}
	return chunks.join("\n").trim();
}

function textFromValue(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (!value || typeof value !== "object") return undefined;
	const obj = value as Record<string, unknown>;
	for (const key of ["result", "response", "text", "output", "content", "message", "final"]) {
		const v = obj[key];
		if (typeof v === "string" && v.trim()) return v.trim();
		if (v && typeof v === "object") {
			const nested = textFromValue(v);
			if (nested) return nested;
		}
	}
	return undefined;
}

export const grok: ProviderSpec = {
	id: "grok",
	label: "Grok CLI",
	bin: resolveGrok(),
	version: "1.0.70",
	capabilities: { "code-review": 4, research: 3, pr: 2 },
	buildArgs({ prompt, cwd, maxTurns }) {
		const args = ["--cwd", cwd, "--output-format", "json", "--always-approve"];
		if (maxTurns) args.push("--max-turns", String(maxTurns));
		args.push("-p", prompt);
		return args;
	},
	parseOutput(stdout) {
		return { text: extractText(stdout) };
	},
};
