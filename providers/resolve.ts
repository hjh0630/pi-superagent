/**
 * Binary resolution helpers.
 *
 * The model CLIs are installed in different shapes on this machine:
 *   - gemini: npm global shim (.cmd) -> real entry is a node script
 *   - claude: npm global shim (.cmd) -> real entry is claude.exe
 *   - codex:  a native exe inside ~/.codex/.sandbox-bin (NOT on PATH)
 *   - grok:   a native exe inside ~/.grok/bin
 *
 * We resolve to the real executable whenever possible, because spawning a
 * Windows .cmd shim requires a shell and breaks argument quoting for prompts
 * that contain quotes or newlines.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** Global npm root on this machine (Windows: %APPDATA%\npm). */
export function npmGlobalRoot(): string {
	const appData = process.env.APPDATA;
	if (appData) return join(appData, "npm");
	return join(homedir(), ".npm-global");
}

/** Finds an executable on PATH, preferring the real binary over a .cmd shim. */
export function findOnPath(name: string): string | undefined {
	const exts = (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean);
	const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
	for (const dir of dirs) {
		for (const ext of exts) {
			const candidate = join(dir, name + ext.toLowerCase());
			if (existsSync(candidate)) return candidate;
		}
	}
	return undefined;
}
