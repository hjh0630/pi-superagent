/**
 * pi provider runner — talks to a child `pi --mode rpc` and prints its final
 * answer on stdout.
 *
 * Why a runner script instead of plain argv: the pi CLI has no one-shot
 * "print the answer" flag; the supported way is the JSONL RPC protocol
 * (docs/rpc.md). This script owns that conversation so the fleet provider
 * stays a normal "spawn + parse" provider.
 *
 * Usage: node pi-runner.mjs --prompt "<task>" --cwd "<dir>" [--model provider/id] [--timeout ms]
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
	args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const prompt = args.get("prompt") ?? "";
const cwd = args.get("cwd") ?? process.cwd();
const timeoutMs = Number(args.get("timeout") ?? 900_000);
const modelSpec = args.get("model");

const npmRoot = process.env.APPDATA ? join(process.env.APPDATA, "npm") : join(process.env.HOME ?? "", ".npm-global");
const piCli = join(npmRoot, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");

const cliArgs = [piCli, "--mode", "rpc", "--no-session"];
if (modelSpec && modelSpec.includes("/")) {
	const [provider, ...rest] = modelSpec.split("/");
	cliArgs.push("--provider", provider, "--model", rest.join("/"));
} else if (modelSpec) {
	cliArgs.push("--model", modelSpec);
}

const child = spawn(process.execPath, cliArgs, {
	cwd,
	stdio: ["pipe", "pipe", "pipe"],
	env: { ...process.env, PI_FLEET_CHILD: "1" },
	windowsHide: true,
});

let buffer = "";
let lastAssistantText = "";
let settled = false;

function finish(text, code) {
	process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
	try {
		child.stdin.end();
	} catch {
		/* already closed */
	}
	child.kill();
	setTimeout(() => process.exit(code), 50);
}

child.stdout.on("data", (chunk) => {
	buffer += chunk.toString("utf8");
	let index;
	while ((index = buffer.indexOf("\n")) >= 0) {
		const line = buffer.slice(0, index);
		buffer = buffer.slice(index + 1);
		if (!line.trim()) continue;
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			continue;
		}

		if (record.type === "message_end" && record.message?.role === "assistant") {
			const text = (record.message.content ?? [])
				.filter((block) => block?.type === "text")
				.map((block) => block.text)
				.join("")
				.trim();
			if (text) lastAssistantText = text;
		}

		if (record.type === "agent_settled") {
			settled = true;
			finish(lastAssistantText || "(pi returned no text)", 0);
		}
	}
});

child.stderr.on("data", (chunk) => {
	process.stderr.write(chunk);
});

child.on("error", (err) => {
	finish(`pi provider failed to start: ${err.message}`, 1);
});

const timer = setTimeout(() => {
	finish(lastAssistantText ? lastAssistantText : "(pi timed out)", settled ? 0 : 1);
}, timeoutMs);
timer.unref?.();

child.stdin.write(`${JSON.stringify({ id: "1", type: "prompt", message: prompt })}\n`);
