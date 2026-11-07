/**
 * The run window: a bounded stretch of time during which the machine is
 * allowed to speak on its own.
 *
 * Why this exists: the watchdog used to tick every hour and say "all fine"
 * whether or not anything was happening, and collect stale alerts for hours
 * before a session was attached. A run window is the promise that the pulse
 * exists for a reason and ends when the reason ends.
 *
 *   node -e "import('./store/runwindow.ts').then(m => m.writeRunWindow({goal:'x', minutes:360}))"
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface RunWindow {
	/** What the window is trying to achieve, in one line. */
	goal: string;
	/** The number the window is trying to move. */
	target?: string;
	started_at: string;
	until: string;
}

export function runWindowPath(): string {
	return join(AGENT_HOME, "superagent", "run-window.json");
}

export function readRunWindow(): RunWindow | null {
	try {
		const path = runWindowPath();
		if (!existsSync(path)) return null;
		const window = JSON.parse(readFileSync(path, "utf8")) as RunWindow;
		if (!window.until || Date.parse(window.until) < Date.now()) return null;
		return window;
	} catch {
		return null;
	}
}

export function writeRunWindow(input: { goal: string; target?: string; minutes: number }): RunWindow {
	const window: RunWindow = {
		goal: input.goal,
		target: input.target,
		started_at: new Date().toISOString(),
		until: new Date(Date.now() + input.minutes * 60_000).toISOString(),
	};
	writeFileSync(runWindowPath(), JSON.stringify(window, null, 2), "utf8");
	return window;
}

export function clearRunWindow(): void {
	const path = runWindowPath();
	if (existsSync(path)) writeFileSync(path, "", "utf8");
}

/** Is the machine allowed to speak by itself right now? */
export function runWindowActive(): boolean {
	return readRunWindow() !== null;
}
