import { homedir } from "node:os";
import { join } from "node:path";
/**
 * The point of the fleet: the same task, several vendors, evidence for each.
 *
 * Usage: node tools/multi-vendor-demo.mjs [task]
 */
import { dispatch } from "../store/runner.ts";
import { routeFor } from "../store/catalog.ts";
import { getProvider } from "../providers/registry.ts";

const task = process.argv[2] ?? "读一下 README.md 的第一行，只回答那一行";
const tags = ["research", "code-review", "general"];
const seen = new Set();
for (const tag of tags) {
	for (const provider of routeFor(tag)) {
		if (seen.has(provider)) continue;
		seen.add(provider);
		const spec = getProvider(provider);
		if (!spec) continue;
		const started = Date.now();
		try {
			const out = await dispatch({
				provider,
				task,
				cwd: process.env.FLEET_CWD || join(homedir(), "fleet-demo"),
				dedupe: false,
				timeoutMs: 240000,
			});
			console.log(`\n=== ${spec.label} ${spec.version} (${provider}) → ${out.status} ${Date.now() - started}ms ===`);
			console.log((out.output || out.stderr || "").slice(0, 400));
		} catch (err) {
			console.log(`\n=== ${provider} → FAILED: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}
