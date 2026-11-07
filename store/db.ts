/**
 * SQLite ledger for pi-superagent.
 *
 * One database holds everything the router, the workers and the human need to
 * agree on: tickets (authorized work), assignments (who did what), reports
 * (evidence), events (audit trail), outbox (messages that still owe a
 * delivery), decisions (what the human already settled), plans (12h windows)
 * and budget (per-provider daily spend).
 *
 * "Stored work": every state change is written here before the action that
 * depends on it happens.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type TicketStatus =
	| "queued"
	| "running"
	| "waiting_approval"
	| "blocked"
	| "done"
	| "failed"
	| "cancelled";

export type AssignmentStatus = "running" | "succeeded" | "failed" | "timeout" | "cancelled";

export interface Ticket {
	id: string;
	title: string;
	intent: string;
	acceptance: string;
	status: TicketStatus;
	budget_cents: number;
	created_at: string;
	updated_at: string;
	notes?: string;
}

export interface Assignment {
	id: string;
	ticket_id: string | null;
	provider: string;
	task: string;
	cwd: string;
	model?: string;
	status: AssignmentStatus;
	exit_code: number | null;
	started_at: string;
	ended_at?: string;
	duration_ms?: number;
	output?: string;
	stderr?: string;
	log_path?: string;
}

export interface Report {
	id: string;
	ticket_id: string | null;
	assignment_id: string | null;
	status: "ready" | "waiting" | "blocked" | "failed";
	evidence: string;
	impact: string;
	created_at: string;
}

export interface OutboxItem {
	id: number;
	ts: string;
	channel: string;
	kind: "heartbeat" | "decision" | "alert" | "summary";
	payload: string;
	status: "pending" | "sent" | "failed";
	attempts: number;
	next_attempt_at?: string;
	sent_at?: string;
}

export function dbPath(): string {
	return join(AGENT_HOME, "superagent", "superagent.db");
}

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
	if (db) return db;
	const path = dbPath();
	mkdirSync(join(AGENT_HOME, "superagent"), { recursive: true });
	db = new DatabaseSync(path);
	db.exec("PRAGMA journal_mode = WAL;");
	db.exec(SCHEMA);
	migrate();
	return db;
}

/**
 * Adds columns that later milestones need, without touching rows that exist.
 * SQLite has no "ADD COLUMN IF NOT EXISTS", so the column list is checked.
 */
function ensureColumn(table: string, column: string, ddl: string): void {
	const columns = getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	if (columns.some((c) => c.name === column)) return;
	getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function migrate(): void {
	// M1: 12h plan windows need a title, steps, a ticket and a decision trail.
	ensureColumn("plans", "title", "title TEXT");
	ensureColumn("plans", "steps", "steps TEXT");
	ensureColumn("plans", "ticket_id", "ticket_id TEXT");
	ensureColumn("plans", "created_at", "created_at TEXT");
	ensureColumn("plans", "decided_at", "decided_at TEXT");
	ensureColumn("plans", "decided_by", "decided_by TEXT");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  intent TEXT,
  acceptance TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  budget_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  provider TEXT NOT NULL,
  task TEXT NOT NULL,
  cwd TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  exit_code INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER,
  output TEXT,
  stderr TEXT,
  log_path TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  assignment_id TEXT,
  status TEXT NOT NULL,
  evidence TEXT,
  impact TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  ticket_id TEXT,
  data TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  scope TEXT,
  text TEXT NOT NULL,
  source TEXT,
  decided_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  summary TEXT,
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT,
  steps TEXT,
  ticket_id TEXT,
  created_at TEXT,
  decided_at TEXT,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS budget (
  day TEXT NOT NULL,
  provider TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider)
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  ticket_id TEXT,
  title TEXT NOT NULL,
  detail TEXT,
  level TEXT NOT NULL,
  scope TEXT,
  tool_name TEXT,
  args_json TEXT,
  args_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  channel TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  decision TEXT
);

CREATE INDEX IF NOT EXISTS idx_assignments_ticket ON assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, id);
CREATE INDEX IF NOT EXISTS idx_approvals_hash ON approvals(args_hash);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  cwd TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  steps TEXT,
  created_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  source TEXT,
  constraints TEXT,
  deliverable TEXT,
  stop_at TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approval_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function nowIso(): string {
	return new Date().toISOString();
}

export function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export function logEvent(kind: string, data: unknown, ticketId?: string): void {
	getDb()
		.prepare("INSERT INTO events (ts, kind, ticket_id, data) VALUES (?, ?, ?, ?)")
		.run(nowIso(), kind, ticketId ?? null, JSON.stringify(data ?? {}));
}
