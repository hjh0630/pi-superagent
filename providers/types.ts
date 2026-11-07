/**
 * Provider contract for pi-model-fleet.
 *
 * One provider = one file. Adding a model means adding a file here and one
 * line in ./registry.ts — the core never changes.
 */

export interface ProviderRunSpec {
	/** The task text handed to the model. */
	prompt: string;
	/** Explicit working directory. Providers never guess it. */
	cwd: string;
	/** Optional model id passed straight to the CLI. */
	model?: string;
	/** Optional turn/step budget for CLIs that support it. */
	maxTurns?: number;
}

export interface ProviderOutput {
	/** Human/model readable text extracted from the CLI output. */
	text: string;
	/** Extra fields worth keeping in the job record (token counts, session ids...). */
	meta?: Record<string, unknown>;
}

export interface ProviderSpec {
	/** Stable id used by the tool and the registry ("gemini", "grok", ...). */
	id: string;
	/** Display name. */
	label: string;
	/**
	 * How to launch the CLI.
	 * - absolute path to an executable: run it directly
	 * - { nodeScript: "<abs path to .js>" }: run it with the current node binary
	 * - plain name: resolved on PATH (a .cmd shim is only used as a last resort)
	 */
	bin: string | { nodeScript: string };
	/** Short version note, purely informational. */
	version?: string;
	/** Capability tags -> priority weight (higher wins when routing). */
	capabilities?: Record<string, number>;
	/** Environment variables that must survive the secret scrubber. */
	envAllow?: string[];
	/** Builds the CLI argument list for one run. */
	buildArgs(spec: ProviderRunSpec): string[];
	/** Extracts the useful text from stdout. */
	parseOutput(stdout: string, stderr: string): ProviderOutput;
	/** Optional extra failure detection (non-zero exit is always a failure). */
	isFailure?(code: number | null, stdout: string, stderr: string): boolean;
}
