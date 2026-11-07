/**
 * One place for every path this toolkit touches.
 *
 * Nothing here is hardcoded to one machine: each location can be overridden
 * with an environment variable, and the default is derived from the user's
 * home directory. That is what makes this package runnable on any machine.
 *
 *   PI_HOME          base of the pi agent directory  (default ~/.pi/agent)
 *   PI_FLEET_HOME    runtime data, logs, live URL   (default $PI_HOME/fleet)
 *   PI_ANALYTICS_DIR first-party analytics          (default $PI_FLEET_HOME/analytics)
 *   PI_LEDGER_DIR    ledger directory                (default $PI_HOME/superagent)
 *   PI_LEDGER_DB     the ledger database              (default $PI_LEDGER_DIR/superagent.db)
 *   PI_RUN_WINDOW    the run-window file             (default $PI_LEDGER_DIR/run-window.json)
 *   PI_SITE_DIR      the site this toolkit publishes (default ~/site)
 *   PI_PROGRESS_DIR  where the hourly reports land   (default $PI_FLEET_HOME/progress)
 *   PI_VAULT_FILE    the mailbox vault               (default $PI_HOME/vault/mailbox.json)
 *   PI_LIVE_URL_FILE the current public URL          (default $PI_FLEET_HOME/live-url.txt)
 *   PI_INDEXNOW_KEY  the IndexNow verification key   (default $PI_FLEET_HOME/indexnow-key.txt)
 *   PI_HITS_FILE     the first-party hits log        (default $PI_ANALYTICS_DIR/hits.jsonl)
 *   PI_TOOLS_DIR     where this package is installed (default $PI_HOME/packages/pi-superagent/tools)
 */

import { homedir } from "node:os";
import { join } from "node:path";

export const HOME = homedir();

export const PI_HOME = process.env.PI_HOME || join(HOME, ".pi", "agent");
export const FLEET_HOME = process.env.PI_FLEET_HOME || join(PI_HOME, "fleet");
export const ANALYTICS_DIR = process.env.PI_ANALYTICS_DIR || join(FLEET_HOME, "analytics");
export const LEDGER_DIR = process.env.PI_LEDGER_DIR || join(PI_HOME, "superagent");
export const LEDGER_DB = process.env.PI_LEDGER_DB || join(LEDGER_DIR, "superagent.db");
export const RUN_WINDOW_FILE = process.env.PI_RUN_WINDOW || join(LEDGER_DIR, "run-window.json");
export const SITE_DIR = process.env.PI_SITE_DIR || join(HOME, "site");
export const PROGRESS_DIR = process.env.PI_PROGRESS_DIR || join(FLEET_HOME, "progress");
export const VAULT_FILE = process.env.PI_VAULT_FILE || join(PI_HOME, "vault", "mailbox.json");
export const LIVE_URL_FILE = process.env.PI_LIVE_URL_FILE || join(FLEET_HOME, "live-url.txt");
export const INDEXNOW_KEY_FILE = process.env.PI_INDEXNOW_KEY || join(FLEET_HOME, "indexnow-key.txt");
export const HITS_FILE = process.env.PI_HITS_FILE || join(ANALYTICS_DIR, "hits.jsonl");
export const TOOLS_DIR = process.env.PI_TOOLS_DIR || join(PI_HOME, "packages", "pi-superagent", "tools");
