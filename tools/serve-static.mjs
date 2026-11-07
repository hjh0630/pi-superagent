/**
 * The site's own server: static files + a tiny, first-party analytics backend.
 *
 * Why first-party: no third-party cookies, no external tracker, nothing leaves
 * the machine. The same process serves the site, logs the hits, accepts
 * beacon events and renders a small dashboard.
 *
 *   GET  /            → the site
 *   GET  /__stats     → dashboard (visits, top pages, referrers, events)
 *   GET  /__stats.json→ the same numbers as JSON
 *   POST /api/track   → beacon (page view / outbound click / form submit)
 *
 * Usage: node tools/serve-static.mjs [port] [distDir] [dataDir]
 */

import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, appendFileSync, statSync as stat } from "node:fs";
import { join, extname, normalize } from "node:path";
import { SITE_DIR, ANALYTICS_DIR, LIVE_URL_FILE, INDEXNOW_KEY_FILE } from "./paths.mjs";

const port = Number(process.argv[2] || 8787);
const root = process.argv[3] || join(SITE_DIR, "dist");
const dataDir = process.argv[4] || ANALYTICS_DIR;
const liveUrlFile = LIVE_URL_FILE;
/** IndexNow verification key: it has to be served from the site root. */
const indexNowKeyFile = INDEXNOW_KEY_FILE;

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
const hitsFile = join(dataDir, "hits.jsonl");
const eventsFile = join(dataDir, "events.jsonl");

const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".xml": "application/xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
};

function currentLiveUrl() {
	try {
		return readFileSync(liveUrlFile, "utf8").trim();
	} catch {
		return "";
	}
}

function logHit(entry) {
	try {
		appendFileSync(hitsFile, `${JSON.stringify(entry)}\n`, "utf8");
	} catch {
		/* ignore */
	}
}

function logEvent(entry) {
	try {
		appendFileSync(eventsFile, `${JSON.stringify(entry)}\n`, "utf8");
	} catch {
		/* ignore */
	}
}

function readJsonl(file) {
	try {
		return readFileSync(file, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((l) => {
				try {
					return JSON.parse(l);
				} catch {
					return null;
				}
			})
			.filter(Boolean);
	} catch {
		return [];
	}
}

function stats() {
	const hits = readJsonl(hitsFile);
	const events = readJsonl(eventsFile);
	const byPath = new Map();
	const byReferrer = new Map();
	const byDay = new Map();
	for (const h of hits) {
		byPath.set(h.path, (byPath.get(h.path) ?? 0) + 1);
		const ref = h.referrer || "(直接访问)";
		byReferrer.set(ref, (byReferrer.get(ref) ?? 0) + 1);
		const day = String(h.at ?? "").slice(0, 10);
		byDay.set(day, (byDay.get(day) ?? 0) + 1);
	}
	const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
	const top = (m, n = 12) => sortDesc(m).slice(0, n).map(([k, v]) => ({ key: k, count: v }));
	const eventCounts = new Map();
	for (const e of events) {
		const k = e.type ?? "unknown";
		eventCounts.set(k, (eventCounts.get(k) ?? 0) + 1);
	}
	return {
		generatedAt: new Date().toISOString(),
		liveUrl: currentLiveUrl(),
		totalHits: hits.length,
		totalEvents: events.length,
		byPath: top(byPath),
		byReferrer: top(byReferrer),
		byDay: [...byDay.entries()].sort(),
		events: [...eventCounts.entries()].map(([type, count]) => ({ type, count })),
		lastHits: hits.slice(-25).reverse(),
		lastEvents: events.slice(-25).reverse(),
	};
}

function dashboard(s) {
	const row = (arr, keyName) =>
		arr.length
			? `<table><tr><th>${keyName}</th><th>次数</th></tr>${arr.map((r) => `<tr><td>${String(r.key).slice(0, 80)}</td><td>${r.count}</td></tr>`).join("")}</table>`
			: "<p>暂无数据</p>";
	return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>MapSignal 访问统计</title>
<style>body{font:14px/1.6 -apple-system,Segoe UI,sans-serif;margin:24px;color:#0f172a;background:#f8fafc}
h1{font-size:20px}table{border-collapse:collapse;margin:8px 0 20px;background:#fff}th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left}
.kpi{display:inline-block;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 18px;margin-right:12px}
.kpi b{display:block;font-size:22px}code{background:#e2e8f0;padding:2px 6px;border-radius:4px}</style></head><body>
<h1>MapSignal 访问统计（第一方，无第三方 Cookie）</h1>
<p>生成时间：${s.generatedAt} ｜ 当前公网地址：${s.liveUrl ? `<code>${s.liveUrl}</code>` : "(未发布)"}</p>
<div><span class="kpi"><b>${s.totalHits}</b>页面访问</span><span class="kpi"><b>${s.totalEvents}</b>事件</span>
<span class="kpi"><b>${s.byPath.length}</b>不同页面</span></div>
<h2>按页面</h2>${row(s.byPath, "路径")}
<h2>按来源</h2>${row(s.byReferrer, "来源")}
<h2>按天</h2>${s.byDay.length ? `<table><tr><th>日期</th><th>访问</th></tr>${s.byDay.map(([d, c]) => `<tr><td>${d}</td><td>${c}</td></tr>`).join("")}</table>` : "<p>暂无</p>"}
<h2>事件</h2>${s.events.length ? `<table><tr><th>类型</th><th>次数</th></tr>${s.events.map((e) => `<tr><td>${e.type}</td><td>${e.count}</td></tr>`).join("")}</table>` : "<p>暂无</p>"}
<h2>最近访问</h2><table><tr><th>时间</th><th>路径</th><th>来源</th><th>UA</th></tr>${s.lastHits.map((h) => `<tr><td>${h.at}</td><td>${h.path}</td><td>${String(h.referrer ?? "").slice(0, 40)}</td><td>${String(h.ua ?? "").slice(0, 40)}</td></tr>`).join("")}</table>
</body></html>`;
}

function clientIp(req) {
	return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0].trim();
}

/**
 * The address of whoever opened the connection to us.
 *
 * Behind a tunnel this is the tunnel's own server, not the person. When the
 * two are the same, the request came from the provider (its warm-up fetch),
 * not from a visitor — and counting it would make the site's own watchdog
 * look like traffic.
 */
function edgeIp(req) {
	return String(req.socket.remoteAddress ?? "?").split(",")[0].trim();
}

/**
 * Lead payloads arrive as JSON (the site always sends JSON) or as a plain
 * form post (the no-JS fallback). The field names match the contract of
 * functions/api/lead.js: name / company / phone / email / zip / trades[] /
 * topic / note / page.
 */
function sanitize(value, max = 200) {
	if (typeof value !== "string") return "";
	return value
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.trim()
		.slice(0, max);
}

function parseLead(body, contentType) {
	const lower = String(contentType).toLowerCase();
	if (lower.includes("application/x-www-form-urlencoded") || lower.includes("multipart/form-data")) {
		const params = new URLSearchParams(body);
		return {
			name: sanitize(params.get("name") ?? "", 80),
			company: sanitize(params.get("company") ?? "", 120),
			phone: sanitize(params.get("phone") ?? "", 40),
			email: sanitize(params.get("email") ?? "", 120),
			zip: sanitize(params.get("zip") ?? "", 20),
			trades: params
				.getAll("trades[]")
				.flatMap((v) => String(v).split(","))
				.map((v) => sanitize(v, 40))
				.filter(Boolean)
				.slice(0, 8),
			topic: sanitize(params.get("topic") ?? "", 80),
			note: sanitize(params.get("note") ?? "", 2000),
			page: sanitize(params.get("page") ?? "", 200),
		};
	}
	try {
		const raw = JSON.parse(body || "{}");
		const trades = Array.isArray(raw.trades)
			? raw.trades
			: typeof raw.trades === "string"
				? raw.trades.split(",")
				: [];
		return {
			name: sanitize(raw.name ?? "", 80),
			company: sanitize(raw.company ?? "", 120),
			phone: sanitize(raw.phone ?? "", 40),
			email: sanitize(raw.email ?? "", 120),
			zip: sanitize(raw.zip ?? "", 20),
			trades: trades.map((v) => sanitize(String(v), 40)).filter(Boolean).slice(0, 8),
			topic: sanitize(raw.topic ?? "", 80),
			note: sanitize(raw.note ?? "", 2000),
			page: sanitize(raw.page ?? "", 200),
		};
	} catch {
		return {};
	}
}

const server = createServer((req, res) => {
	const url = new URL(req.url, `http://localhost:${port}`);
	const pathname = decodeURIComponent(url.pathname);

	// ---- analytics endpoints -------------------------------------------------
	if (pathname === "/api/track" && req.method === "POST") {
		let body = "";
		req.on("data", (c) => {
			body += c;
			if (body.length > 8000) req.destroy();
		});
		req.on("end", () => {
			let payload = {};
			try {
				payload = JSON.parse(body || "{}");
			} catch {
				payload = {};
			}
			logEvent({
				at: new Date().toISOString(),
				type: payload.type ?? "unknown",
				path: payload.path ?? pathname,
				ref: payload.ref ?? "",
				label: String(payload.label ?? "").slice(0, 120),
				ip: clientIp(req),
				ua: String(req.headers["user-agent"] ?? "").slice(0, 200),
			});
			res.writeHead(204, { "cache-control": "no-store" });
			res.end();
		});
		return;
	}
	if (pathname === "/api/lead" && req.method === "POST") {
		let body = "";
		req.on("data", (c) => {
			body += c;
			if (body.length > 20000) req.destroy();
		});
		req.on("end", () => {
			const payload = parseLead(body, req.headers["content-type"] ?? "");
			const lead = {
				at: new Date().toISOString(),
				...payload,
				page: String(payload.page ?? pathname).slice(0, 200),
				ip: clientIp(req),
				ua: String(req.headers["user-agent"] ?? "").slice(0, 200),
				referrer: String(req.headers["referer"] ?? "").slice(0, 200),
			};
			const id = `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
			lead.id = id;
			try {
				appendFileSync(join(dataDir, "leads.jsonl"), `${JSON.stringify(lead)}\n`, "utf8");
			} catch {
				/* ignore */
			}
			logEvent({
				at: lead.at,
				type: "form_submit",
				path: lead.page,
				ref: lead.referrer,
				label: `${lead.topic ?? "lead"} · ${lead.name ?? ""}`.slice(0, 120),
				ip: lead.ip,
				ua: lead.ua,
			});
			console.log(`lead ${id} · ${lead.topic ?? ""} · ${lead.name ?? ""} · ${lead.company ?? ""}`);
			res.writeHead(200, {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store",
			});
			res.end(
				JSON.stringify({
					ok: true,
					received: true,
					id,
					message: "已收到你的申请，48 小时内回复。",
				}),
			);
		});
		return;
	}
	// The leads are readable only from this machine — they carry names,
	// phones and emails.
	if (pathname === "/__leads") {
		const from = String(req.socket.remoteAddress ?? "");
		if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(from)) {
			res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
			res.end(JSON.stringify({ ok: false, reason: "local only" }));
			return;
		}
		let leads = [];
		try {
			leads = readFileSync(join(dataDir, "leads.jsonl"), "utf8")
				.split("\n")
				.filter(Boolean)
				.map((l) => {
					try {
						return JSON.parse(l);
					} catch {
						return null;
					}
				})
				.filter(Boolean);
		} catch {
			leads = [];
		}
		res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
		res.end(JSON.stringify({ ok: true, count: leads.length, leads: leads.slice(-50) }, null, 2));
		return;
	}
	if (pathname === "/indexnow.key.txt") {
		try {
			const key = readFileSync(indexNowKeyFile, "utf8").trim();
			res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" });
			res.end(key);
		} catch {
			res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			res.end("no key");
		}
		return;
	}
	if (pathname === "/__stats.json") {
		res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
		res.end(JSON.stringify(stats(), null, 2));
		return;
	}
	if (pathname === "/__stats") {
		res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
		res.end(dashboard(stats()));
		return;
	}

	// ---- static files --------------------------------------------------------
	let file = join(root, normalize(pathname).replace(/^([/\\])+/, ""));
	// Browsers ask for /favicon.ico on their own. The site declares an SVG
	// icon; answering with it keeps the 404s out of the traffic report
	// without adding a second icon file.
	if (pathname === "/favicon.ico" && !existsSync(file)) {
		const svg = join(root, "assets", "images", "favicon.svg");
		if (existsSync(svg)) file = svg;
	}
	if (!existsSync(file) || stat(file).isDirectory()) {
		const candidates = [join(file, "index.html"), `${file}.html`];
		const hit = candidates.find((c) => existsSync(c) && !stat(c).isDirectory());
		if (hit) {
			file = hit;
		} else {
			logHit({ at: new Date().toISOString(), path: pathname, status: 404, ip: clientIp(req), edge: edgeIp(req), ua: String(req.headers["user-agent"] ?? "").slice(0, 200), referrer: String(req.headers["referer"] ?? "") });
			const notFound = join(root, "404.html");
			if (existsSync(notFound)) {
				res.writeHead(404, { "content-type": MIME[".html"] });
				createReadStream(notFound).pipe(res);
				return;
			}
			res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			res.end("404");
			return;
		}
	}

	const isHtml = extname(file).toLowerCase() === ".html";
	if (isHtml) {
		logHit({
			at: new Date().toISOString(),
			path: pathname,
			status: 200,
			ip: clientIp(req),
			edge: edgeIp(req),
			ua: String(req.headers["user-agent"] ?? "").slice(0, 200),
			referrer: String(req.headers["referer"] ?? ""),
		});
	}

	res.writeHead(200, {
		"content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
		"cache-control": "public, max-age=120",
		"x-content-type-options": "nosniff",
		"referrer-policy": "strict-origin-when-cross-origin",
	});

	if (isHtml) {
		// the page always shows its own current public address
		let html = "";
		try {
			html = readFileSync(file, "utf8");
		} catch {
			html = "";
		}
		html = html.replaceAll("__LIVE_URL__", currentLiveUrl());
		res.end(html);
		return;
	}
	createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
	console.log(`serving ${root} on http://127.0.0.1:${port} (analytics -> ${dataDir})`);
});
