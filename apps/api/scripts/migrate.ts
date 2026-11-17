// Applies apps/api/drizzle migrations with drizzle-orm's migrator, so it runs inside the production image, which has no
// drizzle-kit. Same journal table as `drizzle-kit migrate` (drizzle.__drizzle_migrations), so the two can be mixed.
// Used by deploy/lightsail/docker-compose.yml before the API starts, and by the "Migrate production database" workflow
// (drizzle-kit hid the reason a migration failed behind its spinner; this says it): bun scripts/migrate.ts
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { createDb } from "../src/db/client";
import { databaseUrlFrom } from "../src/parse-env";
import { dbErrorText } from "./db-url-check";

const { db, client } = createDb(databaseUrlFrom(process.env));
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  console.log("migrations: up to date");
} catch (e) {
  // drizzle wraps the driver's error ("Failed query: ..."); the reason is its cause. The code in plain words, then the
  // driver's own message (a host or a failed statement; never the password).
  const reason = (e as { cause?: unknown }).cause ?? e;
  console.error(`migrations: failed. ${dbErrorText(reason)}`);
  console.error(reason instanceof Error ? reason.message : String(reason));
  if (reason !== e && e instanceof Error) console.error(e.message.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await client.end();
}
