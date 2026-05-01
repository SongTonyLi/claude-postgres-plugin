import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./connection";

export async function runMigrations(): Promise<void> {
  const sql = getDb();
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  await sql.unsafe(schema);
  console.log("Migrations complete");
}

// Allow running directly
if (import.meta.main) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
