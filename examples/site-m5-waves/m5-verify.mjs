const FLEET_DIR = process.env.PI_FLEET_HOME || join(homedir(), ".pi", "agent", "fleet");
import { homedir } from "node:os";
import { join } from "node:path";
/**
 * M5 wave 1 acceptance: run our own five-step pipeline on the real site repo.
 *
 * review (grok) -> check (npm run build) -> merge (L3: approval card, not run)
 * -> publish (skipped) -> verify (npm run build again as evidence)
 *
 * Usage: node tools/m5-verify.mjs
 */

import { runPipeline, formatRun } from "../store/pipeline.ts";

const CWD = process.env.SITE_DIR || join(homedir(), "site-m5");
const LOG = join(FLEET_DIR, "m5-verify.log");

function log(line) {
	const stamp = new Date().toISOString().slice(11, 19);
	const text = `[${stamp}] ${line}`;
	console.log(text);
}

const result = await runPipeline({
	cwd: CWD,
	ticketId: "tk-20261103-103815-UBS0",
	checks: ["npm run build"],
	reviewRounds: 1,
	reviewer: "grok",
	mergeCommand: "git merge -m \"M5 wave 1\" main",
	verifyCommand: "npm run build",
	dryRun: false,
});

log(`run ${result.run.id} → ${result.run.status}`);
log(result.report);
log(`审批卡：${result.approvals.join(", ") || "无"}`);
log("DONE");
