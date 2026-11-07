/**
 * Tunnel watchdog — keeps a public preview URL alive.
 *
 * Free tunnels die (rate limits, dropped ssh, VPN interference). This
 * supervisor restarts the tunnel when the URL stops answering and writes the
 * current URL to ~/.pi/agent/fleet/live-url.txt, so nothing else has to know.
 *
 * Usage: node tools/tunnel-watchdog.mjs
 */

import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FLEET_HOME, TOOLS_DIR } from "./paths.mjs";

const PORT = "8787";
const DIR = FLEET_HOME;
const URL_FILE = join(DIR, "live-url.txt");
const LOG = join(DIR, "tunnel-watchdog.log");
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

function log(line) {
	const text = `[${new Date().toISOString().slice(11, 19)}] ${line}\n`;
	try {
		writeFileSync(LOG, text, { encoding: "utf-8", flag: "a" });
	} catch {
		/* ignore */
	}
	console.log(text.trim());
}

let child = null;
let url = "";
// Providers are tried in order: the first one that answers with our site
// wins. Randomising them only means the shareable address changes for no
// reason.
const providers = [
	{ host: "serveo.net", re: /https:\/\/[a-z0-9.-]+\.serveousercontent\.com/ },
	{ host: "nokey@localhost.run", re: /https:\/\/[a-z0-9.-]+\.lhr\.life/ },
];
let providerIndex = 0;

function startTunnel() {
	if (child) {
		try {
			child.kill();
		} catch {
			/* ignore */
		}
	}
	url = "";
	// serveo shows a "Browser Warning" interstitial to real browsers, so it is
	// not usable as a shareable address. localhost.run serves the site as-is;
	// serveo is kept as a second provider because one dead tunnel is one dead
	// preview, and the alive() check below refuses any provider that answers
	// with a warning page.
	const pick = providers[providerIndex];
	const out = spawn(
		"ssh",
		["-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=3", "-R", `80:127.0.0.1:${PORT}`, pick.host],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	child = out;
	const scan = (buf) => {
		const m = pick.re.exec(buf.toString());
		if (m && m[0] !== url) {
			url = m[0];
			writeFileSync(URL_FILE, url, "utf8");
			log(`tunnel up (${pick.host}): ${url}`);
			refreshShortLink();
		}
	};
	out.stdout.on("data", scan);
	out.stderr.on("data", scan);
	out.on("exit", (code) => log(`tunnel exited code=${code} (${pick.host})`));
}

/** The shareable short link follows the tunnel address. */
function refreshShortLink() {
	try {
		execFileSync(process.execPath, [join(TOOLS_DIR, "refresh-shortlink.mjs"), "--quiet"], {
			timeout: 40000,
			stdio: ["ignore", "ignore", "ignore"],
		});
	} catch {
		/* the shortener may be unreachable; the page still shows the live url */
	}
}

const BROWSER_HEADERS = {
	"user-agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
	"accept-language": "en-US,en;q=0.9",
};

/**
 * The health check has to look like a browser (serveo serves an interstitial
 * to anything else) — but it must not look like a visitor, or the site's own
 * watchdog would be the only "real" traffic it ever gets. The marker below
 * is what the analytics filter looks for.
 */
const HEALTH_UA = "MapSignalHealthCheck/1.0 (tunnel watchdog)";

/**
 * A tunnel is only "alive" if a real browser gets the real site.
 * Status 200 is not enough: serveo answers 200 with a warning page.
 */
async function alive(target) {
	try {
		const res = await fetch(target, {
			headers: { ...BROWSER_HEADERS, "user-agent": HEALTH_UA },
			signal: AbortSignal.timeout(25000),
		});
		const body = await res.text();
		if (res.status < 200 || res.status >= 400) return 0;
		if (!body.includes("MapSignal")) return -1; // a tunnel that serves an interstitial
		return res.status;
	} catch {
		return 0;
	}
}

startTunnel();
let fails = 0;
while (true) {
	await new Promise((r) => setTimeout(r, 45000));
	if (!url) {
		log("no url yet, restarting tunnel");
		startTunnel();
		continue;
	}
	const status = await alive(url);
	if (status >= 200 && status < 400) {
		fails = 0;
		log(`ok ${status} ${url}`);
		continue;
	}
	fails++;
	log(`check failed (${status}) → ${url} (${fails}/3)`);
	// A status of 0 means we could not reach the address at all. On this
	// network the DNS for tunnel hosts is sometimes hijacked (everything
	// resolves to an internal wildcard), so "I cannot resolve it" says
	// nothing about the tunnel: the tunnel is fine and the internet can
	// reach it. Restarting on that signal just churns the URL. A status of
	// -1 means the tunnel answered with a warning page — that one is real.
	if (status === 0) {
		log("local network cannot resolve/reach the address — keeping the tunnel (the public side is unaffected)");
		fails = 0;
		continue;
	}
	if (fails >= 3) {
		fails = 0;
		providerIndex = (providerIndex + 1) % providers.length;
		log(`restarting tunnel (next provider: ${providers[providerIndex].host})`);
		startTunnel();
	}
}
