import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection";

export async function runMigrations(): Promise<void> {
  const db = getDb();
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
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
