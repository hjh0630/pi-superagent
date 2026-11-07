/**
 * Refresh the shareable short link.
 *
 * The public tunnel address changes whenever the tunnel reconnects, so the
 * short link has to be repointed with it. is.gd works with a plain GET (no
 * account), the current link is written to ~/.pi/agent/fleet/share-link.txt
 * and shown in every 12-hour report.
 *
 * Usage: node tools/refresh-shortlink.mjs [--quiet]
 */

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".pi", "agent", "fleet");
const LIVE = join(DIR, "live-url.txt");
const SHARE = join(DIR, "share-link.txt");
const quiet = process.argv.includes("--quiet");

const BROWSER_HEADERS = {
	"user-agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

/** The address must serve our real site to a real browser, not a warning page. */
async function servesOurSite(url) {
	try {
		const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(25000) });
		const body = await res.text();
		return res.status >= 200 && res.status < 400 && body.includes("MapSignal");
	} catch {
		return false;
	}
}

async function shorten(url) {
	const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, {
		signal: AbortSignal.timeout(25000),
	});
	const text = (await res.text()).trim();
	return /^https:\/\//.test(text) ? text : null;
}

let live = "";
try {
	live = readFileSync(LIVE, "utf8").trim();
} catch {
	/* no tunnel yet */
}
if (!live) {
	console.log("no live url yet");
	process.exit(0);
}

let short = null;
if (await servesOurSite(live)) {
	try {
		short = await shorten(live);
	} catch (err) {
		console.log(`shorten failed: ${err instanceof Error ? err.message : String(err)}`);
	}
} else {
	console.log(`live url does not serve the site to a browser: ${live}`);
}
if (!short) {
	// keep the previous link if the shortener is unreachable
	try {
		short = readFileSync(SHARE, "utf8").trim().split("\n")[0] || null;
	} catch {
		short = null;
	}
}

const line = short ? `${short}\t${live}` : live;
writeFileSync(SHARE, `${line}\n`, "utf8");
if (!quiet) console.log(line);
