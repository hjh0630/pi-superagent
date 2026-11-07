/**
 * A local DNS resolver that speaks DoH to the outside world.
 *
 * Why this exists: on this network every plain DNS query is rewritten to an
 * intranet wildcard (*.sincetech.com.cn), including queries aimed at
 * 8.8.8.8 or 223.5.5.5. DNS over HTTPS is not rewritten, so the tunnel's
 * edge hostnames can only be resolved this way.
 *
 * It is a plain DNS server on 127.0.0.1 (UDP and TCP) that forwards each
 * message to a DoH resolver and hands the answer back untouched.
 *
 *   node tools/doh-dns.mjs [--port 5354] [--upstream https://dns.alidns.com/dns-query]
 *
 * Point a client at it with --dns-resolver-addrs 127.0.0.1:5354, which is
 * how cloudflared is told to use it.
 */

import { createSocket } from "node:dgram";
import { createServer } from "node:net";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
	if (i < 0) return fallback;
	const arg = argv[i];
	return arg.startsWith(`--${name}=`) ? arg.slice(name.length + 3) : argv[i + 1];
};

const PORT = Number(flag("port", 53));
const UPSTREAM = flag("upstream", "https://dns.alidns.com/dns-query");
const BACKUP = flag("backup", "https://doh.pub/dns-query");
const DEBUG = process.env.DOH_DNS_DEBUG === "1";

let served = 0;
let failed = 0;

function toBase64Url(buffer) {
	return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The answer from a DoH resolver, as a DNS message. */
async function ask(url, query) {
	const res = await fetch(`${url}?dns=${toBase64Url(query)}`, {
		headers: { accept: "application/dns-message" },
		signal: AbortSignal.timeout(8000),
	});
	if (!res.ok) throw new Error(`upstream ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

async function resolve(query) {
	try {
		return await ask(UPSTREAM, query);
	} catch (error) {
		if (DEBUG) console.log(`primary failed: ${error?.message}`);
		try {
			return await ask(BACKUP, query);
		} catch (backupError) {
			if (DEBUG) console.log(`backup failed: ${backupError?.message}`);
			failed++;
			return null;
		}
	}
}

/** SERVFAIL for a query we could not answer. */
function servfail(query) {
	const out = Buffer.from(query);
	if (out.length >= 4) {
		out[2] = 0x81; // response, recursion desired
		out[3] = 0x82; // SERVFAIL
	}
	return out;
}

const udp = createSocket("udp4");
udp.on("message", async (msg, rinfo) => {
	let answer = null;
	try {
		answer = (await resolve(msg)) ?? servfail(msg);
	} catch (error) {
		console.log("query failed:", error?.message);
		answer = servfail(msg);
	}
	served++;
	if (DEBUG) {
		console.log("Q", msg.toString("hex"));
		console.log("A", answer.toString("hex"));
	}
	try {
		udp.send(answer, rinfo.port, rinfo.address);
	} catch (error) {
		console.log("send failed:", error?.message);
	}
});
udp.bind(PORT, "127.0.0.1");

const tcp = createServer((socket) => {
	let buffer = Buffer.alloc(0);
	socket.on("data", async (chunk) => {
		buffer = Buffer.concat([buffer, chunk]);
		while (buffer.length >= 2) {
			const length = buffer.readUInt16BE(0);
			if (buffer.length < length + 2) return;
			const query = buffer.subarray(2, length + 2);
			buffer = buffer.subarray(length + 2);
			const answer = (await resolve(query)) ?? servfail(query);
			served++;
			const header = Buffer.alloc(2);
			header.writeUInt16BE(answer.length, 0);
			socket.write(Buffer.concat([header, answer]));
		}
	});
	socket.on("error", () => {});
});
tcp.listen(PORT, "127.0.0.1");

console.log(`doh-dns listening on 127.0.0.1:${PORT} -> ${UPSTREAM} (backup ${BACKUP})`);
setInterval(() => {
	if (served || failed) {
		console.log(`doh-dns served=${served} failed=${failed}`);
		served = 0;
		failed = 0;
	}
}, 300000).unref?.();
