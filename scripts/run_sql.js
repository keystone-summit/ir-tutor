// Dependency-light migration/SQL runner for the IR Tutor Supabase project.
// Connects via the Supabase SESSION pooler (port 5432) as the postgres role
// so DDL + multi-statement SQL run cleanly. Usage:
//   node scripts/run_sql.js path/to/file.sql
//   node scripts/run_sql.js --q "select 1"
const fs = require("fs");
const { Client } = require("pg");

const REF = process.env.SUPA_REF || "qagrlogyxuzhddhcpifj";
const PASSWORD = process.env.SUPA_DB_PASSWORD; // pass via env, never hardcode
const HOST = process.env.SUPA_HOST || "aws-1-us-east-1.pooler.supabase.com";
const PORT = parseInt(process.env.SUPA_PORT || "5432", 10);

async function main() {
  if (!PASSWORD) throw new Error("Set SUPA_DB_PASSWORD env var.");
  const arg = process.argv[2];
  let sql;
  if (arg === "--q") sql = process.argv[3];
  else sql = fs.readFileSync(arg, "utf8");

  const client = new Client({
    host: HOST,
    port: PORT,
    user: `postgres.${REF}`,
    password: PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    const res = await client.query(sql);
    if (Array.isArray(res)) {
      res.forEach((r, i) => console.log(`stmt[${i}]:`, r.command, r.rowCount ?? "", r.rows && r.rows.length ? JSON.stringify(r.rows.slice(0, 20)) : ""));
    } else {
      console.log("OK:", res.command, res.rowCount ?? "", res.rows && res.rows.length ? JSON.stringify(res.rows.slice(0, 20)) : "");
    }
    console.log("DONE");
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
