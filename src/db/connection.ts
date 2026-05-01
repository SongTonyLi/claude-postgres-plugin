import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/claude_sessions";

let sql: ReturnType<typeof postgres>;

export function getDb(): ReturnType<typeof postgres> {
  if (!sql) {
    sql = postgres(DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    const conn = sql;
    sql = undefined!;
    await conn.end();
  }
}
