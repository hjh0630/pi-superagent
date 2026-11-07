/**
 * Running one provider CLI.
 *
 * Kept separate from the dispatch engine so the `/fleet run` command and the
 * background dispatcher share exactly the same process handling.
 */

import { spawn } from "node:child_process";
import type { ProviderSpec } from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 900_000;
export const MAX_OUTPUT_CHARS = 12_000;

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	cancelled: boolean;
	/** Pid of the provider process, for orphan detection. */
	pid?: number;
}

/** Quotes an argument for cmd.exe when we have to fall back to a .cmd shim. */
function quoteForCmd(arg: string): string {
	return `"${arg.replace(/"/g, '\\"')}"`;
}

/** Removes credential-looking environment variables from the child process. */
export function buildEnv(spec: ProviderSpec): NodeJS.ProcessEnv {
	const allow = new Set((spec.envAllow ?? []).map((s) => s.toUpperCase()));
	const secret = /(_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIAL|_AUTH)$/;
	const env: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value === undefined) continue;
		const upper = key.toUpperCase();
		if (!allow.has(upper) && secret.test(upper)) continue;
		env[key] = value;
	}
	return env;
}

export function launch(spec: ProviderSpec, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
	let command: string;
	let finalArgs: string[];

	if (typeof spec.bin === "object") {
		command = process.execPath;
		finalArgs = [spec.bin.nodeScript, ...args];
	} else {
		command = spec.bin;
		finalArgs = args;
	}

	// Windows .cmd shims need a shell; only used when no real binary was found.
	if (/\.cmd$/i.test(command)) {
		const line = [command, ...finalArgs].map(quoteForCmd).join(" ");
		command = process.env.ComSpec || "cmd.exe";
		finalArgs = ["/d", "/s", "/c", line];
	}

	// stdin is closed on purpose: codex exec and friends read extra input from
	// stdin and would hang forever if the pipe stays open.
	return spawn(command, finalArgs, { cwd, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
}

export function runProvider(
	spec: ProviderSpec,
	args: string[],
	cwd: string,
	timeoutMs: number,
	signal: AbortSignal | undefined,
	onTick?: (tail: string) => void,
	onStart?: (pid: number) => void,
): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = launch(spec, args, cwd, buildEnv(spec));
		if (child.pid) onStart?.(child.pid);
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let cancelled = false;

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
			onTick?.(stdout.slice(-2000));
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});

		const kill = () => {
			try {
				child.kill();
			} catch {
				/* already gone */
			}
		};

		const timer = setTimeout(() => {
			timedOut = true;
			kill();
		}, timeoutMs);

		const onAbort = () => {
			cancelled = true;
			kill();
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		child.on("error", (err) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolve({ code: null, stdout, stderr: stderr + `\n${err.message}`, timedOut, cancelled, pid: child.pid });
		});

		child.on("close", (code) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolve({ code, stdout, stderr, timedOut, cancelled, pid: child.pid });
		});
	});
}

export function truncate(text: string, limit = MAX_OUTPUT_CHARS): string {
	if (text.length <= limit) return text;
	return `${text.slice(0, limit)}\n… [truncated, ${text.length} chars total — full text in the job log]`;
}
