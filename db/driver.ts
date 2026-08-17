import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

/**
 * The one driver, wired once.
 *
 * `drizzle-orm/neon-serverless` over a WebSocket `Pool`, for the app and for the
 * migration runner alike (SPEC.md §6). Not Neon's HTTP interface: it has no
 * interactive transactions, and two things here need one — the watch write at build
 * step 4, and halt-on-partial-failure in the migration runner now. One driver because
 * constraint 1 is one data path, and a second local-only driver is how that starts.
 *
 * Everything that opens a connection goes through `createPool` here. Nothing else
 * constructs a `Pool`.
 */

let configured = false;

/**
 * `neonConfig` is global to the driver, so this is applied once per process and is
 * safe to call repeatedly.
 */
export function configureDriver(): void {
  if (configured) return;
  configured = true;

  // Node has a global WebSocket, but the driver gets `ws` explicitly so local and
  // production speak the identical implementation rather than whichever one the
  // runtime happens to provide.
  neonConfig.webSocketConstructor = ws;

  /**
   * Local Postgres is reached through `wsproxy` (docker-compose.yml), which unwraps
   * the WebSocket and forwards raw TCP. Unset in production, where the host is Neon
   * and the driver's own defaults — `wss://`, TLS terminated at the proxy — are what
   * we want.
   */
  const wsProxyHost = process.env.DATABASE_WS_PROXY;
  if (!wsProxyHost) return;

  neonConfig.wsProxy = (host, port) => `${wsProxyHost}/v1?address=${host}:${port}`;
  // Plain `ws://` on the loopback interface. There is no TLS to terminate locally, and
  // the alternative — the driver's experimental pure-JS encryption — is documented as
  // unsuitable for production, so it would not be the same path either.
  neonConfig.useSecureWebSocket = false;
  // Pipelining the startup packet only works against cleartext password auth. Local
  // Postgres uses scram-sha-256, matching Neon, so the pipeline is turned off rather
  // than the auth weakened to suit the driver.
  neonConfig.pipelineConnect = false;
}

export function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // Loud, and early. The alternative is a connection failure several frames later
    // wearing a stranger message.
    throw new Error(
      "DATABASE_URL is not set. Copy env.example to .env — see docs/local-development.md.",
    );
  }
  return databaseUrl;
}

export function createPool(connectionString: string): Pool {
  configureDriver();
  const pool = new Pool({ connectionString });
  // A pool that emits `error` with no listener takes the process down. Reads and
  // writes still surface their own failures at the call site; this only stops an
  // idle-client reconnect from being fatal.
  pool.on("error", (error: unknown) => {
    console.error("[db] pool error", error);
  });
  return pool;
}
