/**
 * Egress proxy — get out of a broken proxy without touching the machine.
 *
 * Some networks put a TUN client (Clash and friends) in front of everything.
 * When its selected node is dead, every domain-based request times out even
 * though the physical link is fine. This process listens on 127.0.0.1 only and
 * forwards CONNECT/plain HTTP over the **physical interface**, resolving names
 * through DNS-over-HTTPS so the hijacked resolver cannot lie to it.
 *
 * It changes nothing on the machine: no route, no DNS setting, no adapter.
 * It dies with the terminal that started it.
 *
 *   # test
 *   node tools/egress-proxy.mjs &
 *   curl -x http://127.0.0.1:8899 https://api.github.com/user
 *
 *   # git
 *   git -c http.proxy=http://127.0.0.1:8899 push origin main
 *
 * Environment:
 *   EGRESS_PORT        listen port              (default 8899)
 *   EGRESS_SOURCE_IP   bind the source address  (default: the routing table's choice)
 *   EGRESS_DOH_HOST    DoH host name            (default dns.alidns.com)
 *   EGRESS_DOH_IP      DoH host address         (default 223.5.5.5)
 */

import http from "node:http";
import https from "node:https";
import net from "node:net";

const PORT = Number(process.env.EGRESS_PORT || 8899);
const SOURCE_IP = process.env.EGRESS_SOURCE_IP || "";
const DOH_HOST = process.env.EGRESS_DOH_HOST || "dns.alidns.com";
const DOH_IP = process.env.EGRESS_DOH_IP || "223.5.5.5";

/** A DNS query for A records, base64url encoded (RFC 8484 wire format). */
function dnsQuery(name, type = 1) {
	const parts = name.split(".");
	const header = Buffer.from([0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
	const body = Buffer.concat([
		...parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p, "ascii")])),
		Buffer.from([0x00, 0x00, type >> 8, type & 0xff, 0x00, 0x01]),
	]);
	return Buffer.concat([header, body]).toString("base64url");
}

function parseAnswers(buf) {
	if (buf.length < 12) return [];
	const ancount = buf.readUInt16BE(6);
	const qdcount = buf.readUInt16BE(4);
	let off = 12;
	for (let i = 0; i < qdcount; i++) {
		while (buf[off]) off += buf[off] + 1;
		off += 5;
	}
	const ips = [];
	for (let i = 0; i < ancount; i++) {
		if (buf[off] >= 0xc0) off += 2;
		else {
			while (buf[off]) off += buf[off] + 1;
			off += 1;
		}
		const type = buf.readUInt16BE(off);
		off += 8;
		const rdlen = buf.readUInt16BE(off);
		off += 2;
		const rdata = buf.subarray(off, off + rdlen);
		off += rdlen;
		if (type === 1) ips.push([...rdata].join("."));
	}
	return ips;
}

async function resolve(host) {
	if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return [host];
	const req = https.request({
		host: DOH_IP,
		port: 443,
		servername: DOH_HOST,
		path: `/dns-query?dns=${dnsQuery(host)}`,
		headers: { Host: DOH_HOST, accept: "application/dns-message" },
		timeout: 10000,
	});
	return new Promise((ok, fail) => {
		req.on("response", (res) => {
			const chunks = [];
			res.on("data", (c) => chunks.push(c));
			res.on("end", () => {
				const ips = parseAnswers(Buffer.concat(chunks));
				ips.length ? ok(ips) : fail(new Error(`no A record for ${host}`));
			});
		});
		req.on("timeout", () => req.destroy(new Error("doh timeout")));
		req.on("error", fail);
		req.end();
	});
}

function dial(ip, port) {
	return net.connect({ host: ip, port, localAddress: SOURCE_IP || undefined, timeout: 15000 });
}

const server = http.createServer(async (req, res) => {
	try {
		const target = new URL(req.url);
		const ips = await resolve(target.hostname);
		const upstream = dial(ips[0], Number(target.port || 80));
		upstream.on("connect", () => {
			res.writeHead(200, { "content-type": "text/plain" });
			res.end("egress proxy ok\n");
		});
		upstream.on("error", (e) => {
			res.writeHead(502);
			res.end(`bad gateway: ${e.message}\n`);
		});
	} catch (e) {
		res.writeHead(502);
		res.end(`bad gateway: ${e.message}\n`);
	}
});

server.on("connect", async (req, clientSocket, head) => {
	try {
		const [host, port] = req.url.split(":");
		const ips = await resolve(host);
		const upstream = dial(ips[0], Number(port));
		upstream.on("connect", () => {
			clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
			if (head && head.length) upstream.write(head);
			upstream.pipe(clientSocket);
			clientSocket.pipe(upstream);
		});
		upstream.on("error", (e) => clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${e.message}\n`));
		clientSocket.on("error", () => {});
	} catch (e) {
		clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${e.message}\n`);
	}
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`egress proxy on 127.0.0.1:${PORT} (source ${SOURCE_IP || "auto"}, DoH ${DOH_IP})`);
});
