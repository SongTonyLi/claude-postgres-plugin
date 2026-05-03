import { getDb } from "./connection";
// Embed the schema at build time so the compiled binary doesn't need a sibling
// schema.sql file. Works under both `bun run` and `bun build --compile`.
import schema from "./schema.sql" with { type: "text" };

export async function runMigrations(): Promise<void> {
  const db = getDb();
  db.exec(schema);
  // stderr is safe for both standalone use and the stdio MCP server (which
  // reserves stdout for the JSON-RPC protocol).
  console.error("Migrations complete");
}

if (import.meta.main) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
