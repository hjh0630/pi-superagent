/**
 * Roles — the "bots" that do the work.
 *
 * A provider is a hand; a role is a job description. The role carries the
 * standing brief (Grok Bot calls it the Bot description), the executor and
 * the acceptance style. Plans name roles, not providers, so the fleet can
 * swap executors without rewriting the plan.
 */

import { loadRules, providerHealth } from "./catalog.ts";
import { getProvider } from "../providers/registry.ts";

export interface Role {
	id: string;
	label: string;
	/** Preferred executor. */
	provider?: string;
	/** Standing instructions prepended to every task for this role. */
	brief?: string;
}

export interface RoleSpec extends Role {
	/** The executor actually used (falls back to the role's provider). */
	executor: string;
}

export function listRoles(): Role[] {
	const rules = loadRules() as ReturnType<typeof loadRules> & { roles?: Record<string, Role> };
	const roles = rules.roles ?? {};
	return Object.entries(roles).map(([id, r]) => ({ ...r, id }));
}

export function getRole(roleId: string): Role | undefined {
	return listRoles().find((r) => r.id === roleId);
}

/**
 * A single-provider override: `PI_FLEET_ONLY_PROVIDER=pi` forces every role
 * and every reviewer onto one executor. Used when only one model may run
 * (cost, policy, or an outage on the others).
 */
export function onlyProvider(): string | undefined {
	const forced = process.env.PI_FLEET_ONLY_PROVIDER?.trim();
	return forced && getProvider(forced) ? forced : undefined;
}

/**
 * The executor for a role: the role's provider when it is usable, otherwise
 * the healthiest provider that can serve general work.
 */
export function resolveExecutor(roleId: string): RoleSpec {
	const role = getRole(roleId);
	if (!role) {
		const known = listRoles().map((r) => r.id).join(", ");
		throw new Error(`Unknown role "${roleId}". Known roles: ${known}`);
	}
	const forced = onlyProvider();
	if (forced) return { ...role, provider: forced, executor: forced };
	const candidates = [role.provider, "antigravity", "grok", "pi"].filter((id): id is string => Boolean(id));
	for (const id of candidates) {
		if (!getProvider(id)) continue;
		const health = providerHealth(id);
		if (health.lastStatus === "failed" && health.failures >= 2) continue;
		return { ...role, executor: id };
	}
	throw new Error(`No usable executor for role "${roleId}"`);
}

/** The full task text for a role: brief + the actual work. */
export function composeTask(role: RoleSpec, task: string): string {
	if (!role.brief) return task;
	return `${role.brief}\n\n---\n\n${task}`;
}
