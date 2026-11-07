/**
 * Portability guard.
 *
 * The whole point of this package is that it runs on any machine, so no file
 * may contain an absolute path that belongs to one particular computer.
 * This check fails loudly when such a path shows up again.
 *
 *   node tools/check-portable.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCAN_DIRS = ["extensions", "providers", "store", "tools", "examples", "config"];
const SCAN_FILES = ["runtime.ts", "package.json", "tsconfig.json"];

/** Absolute paths that are always machine-specific. */
const FORBIDDEN = [
	/[A-Za-z]:[\\/]Users[\\/][^\\/]+/g, // C:\Users\someone\...
	/\/home\/[^\/\s"']+/g, // /home/someone/...
	/\/Users\/[^\/\s"']+/g, // /Users/someone/...
];

const TEXT_EXT = new Set([".ts", ".mjs", ".js", ".json", ".sh", ".py", ".md", ".yml", ".yaml", ".txt"]);

function walk(dir, acc = []) {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) walk(full, acc);
		else if (TEXT_EXT.has(full.slice(full.lastIndexOf(".")))) acc.push(full);
	}
	return acc;
}

const files = [];
for (const dir of SCAN_DIRS) {
	try {
		walk(join(ROOT, dir), files);
	} catch {
		/* a directory that is not there is not a problem */
	}
}
for (const f of SCAN_FILES) {
	try {
		statSync(join(ROOT, f));
		files.push(join(ROOT, f));
	} catch {
		/* optional */
	}
}

let bad = 0;
for (const file of files) {
	const text = readFileSync(file, "utf8");
	const rel = relative(ROOT, file);
	// This file has to spell the patterns out, so it cannot police itself.
	if (rel.replace(/\\/g, "/") === "tools/check-portable.mjs") continue;
	text.split("\n").forEach((line, i) => {
		for (const pattern of FORBIDDEN) {
			pattern.lastIndex = 0;
			const hit = pattern.exec(line);
			if (!hit) continue;
			// A path inside a comment that documents the rule is fine only if it
			// is about a placeholder; anything else is a leak.
			bad++;
			console.log(`LEAK  ${rel}:${i + 1}  ${hit[0]}   |  ${line.trim().slice(0, 90)}`);
		}
	});
}

if (bad) {
	console.error(`\n${bad} machine-specific path(s) found — this package is not portable yet.`);
	process.exit(1);
}
console.log(`portable: ${files.length} files scanned, no machine-specific absolute paths.`);
