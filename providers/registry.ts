/**
 * The provider registry.
 *
 * Adding a model: create providers/<id>.ts exporting a ProviderSpec and add
 * one line below. Nothing else in the codebase changes.
 */

import type { ProviderSpec } from "./types.ts";
import { gemini } from "./gemini.ts";
import { grok } from "./grok.ts";
import { codex } from "./codex.ts";
import { claude } from "./claude.ts";
import { pi } from "./pi.ts";
import { antigravity } from "./antigravity.ts";

export const providers: ProviderSpec[] = [gemini, grok, codex, claude, pi, antigravity];

const byId = new Map(providers.map((p) => [p.id, p]));

export function getProvider(id: string): ProviderSpec | undefined {
	return byId.get(id.toLowerCase());
}

export function providerIds(): string[] {
	return providers.map((p) => p.id);
}

export type { ProviderSpec, ProviderRunSpec, ProviderOutput } from "./types.ts";
