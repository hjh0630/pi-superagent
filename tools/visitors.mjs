/**
 * One definition of "a real visit", shared by the watchdog and the hourly
 * progress report.
 *
 * A request is a visitor when it did not come from this machine and was not
 * made by a tool: the tunnel provider re-fetching the page to keep it warm,
 * our own build/verify probes, a curl health check. Counting those would make
 * the number look better than it is, so they are separated and reported
 * apart.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ANALYTICS_DIR } from "./paths.mjs";

const HITS_FILE_DEFAULT = join(ANALYTICS_DIR, "hits.jsonl");

export const HITS_FILE = process.env.PI_HITS_FILE || HITS_FILE_DEFAULT;

export function loadHits(file = HITS_FILE) {
	if (!existsSync(file)) return [];
	const out = [];
	for (const line of readFileSync(file, "utf8").split("\n")) {
		if (!line.trim()) continue;
		try {
			out.push(JSON.parse(line));
		} catch {
			/* a torn line is skipped, not guessed at */
		}
	}
	return out;
}

/** Our own machine: the build, the verify script, a local curl. */
export function isSelfCheck(hit) {
	const ip = String(hit.ip ?? "");
	return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/** A tool talking to the site, not a person. */
export function isProbe(hit) {
	const ua = String(hit.ua ?? "");
	const ref = String(hit.referrer ?? "");
	const path = String(hit.path ?? "");
	if (/HealthCheck/i.test(ua) || /hc=1/.test(path)) return true; // our own tunnel health check
	return /^(node|curl|Go-http-client|wget|python-requests|axios)/i.test(ua) || /serveousercontent|localhost\.run/i.test(ref);
}

export function isRealVisitor(hit) {
	if (isSelfCheck(hit)) return false;
	if (isProbe(hit)) return false;
	// The tunnel's own fetch is a probe (see isProbe). Everything else that
	// is not this machine and not a tool is a visitor.
	return true;
}

/**
 * Was the visitor's own address preserved?
 *
 * Cloudflare-style tunnels forward X-Forwarded-For, so the person's address
 * survives. A plain SSH tunnel erases it: every request then arrives from
 * the tunnel server's address. Both are real visits, but only the first can
 * be counted per person, so the report keeps them apart.
 */
export function isIdentified(hit) {
	if (hit.edge === undefined || hit.edge === null) return false;
	return String(hit.ip ?? "") !== String(hit.edge ?? "");
}

/**
 * The visitors since a moment, plus the shape of their visit.
 */
export function visitorReport(hits, sinceIso) {
	const since = sinceIso ? Date.parse(sinceIso) : 0;
	const inWindow = hits.filter((h) => Date.parse(h.at) >= since);
	const visitors = inWindow.filter(isRealVisitor);
	const probes = inWindow.filter((h) => !isSelfCheck(h) && isProbe(h));
	const selfChecks = inWindow.filter(isSelfCheck);

	const byPath = new Map();
	const byHour = new Map();
	const ips = new Set();
	const uas = new Set();
	let identified = 0;
	for (const v of visitors) {
		byPath.set(v.path, (byPath.get(v.path) ?? 0) + 1);
		const hour = String(v.at).slice(0, 13);
		byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
		ips.add(String(v.ip ?? ""));
		uas.add(String(v.ua ?? "").slice(0, 80));
		if (isIdentified(v)) identified++;
	}

	return {
		windowRequests: inWindow.length,
		visitors: visitors.length,
		identified,
		uniqueIps: ips.size,
		uniqueAgents: uas.size,
		selfChecks: selfChecks.length,
		probes: probes.length,
		byPath: [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
		byHour: [...byHour.entries()].sort((a, b) => a[0].localeCompare(b[0])),
	};
}
