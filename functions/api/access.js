const CLIENT_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function monthKeyUTC(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS monthly_stats (
        month_key TEXT PRIMARY KEY,
        access_count INTEGER NOT NULL DEFAULT 0,
        unique_client_count INTEGER NOT NULL DEFAULT 0
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS monthly_clients (
        month_key TEXT NOT NULL,
        client_id TEXT NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(month_key, client_id)
      )`
    ),
  ]);

  try {
    await db.prepare("ALTER TABLE monthly_clients ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0").run();
  } catch (_) {}
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ACCESS_LOG_DB) {
    return json({ ok: false, error: "db_binding_missing" }, 500);
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch (_) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const clientId = String(payload.clientId || "").trim();
  if (!CLIENT_ID_RE.test(clientId)) {
    return json({ ok: false, error: "invalid_client_id" }, 400);
  }

  const month = monthKeyUTC();
  const db = env.ACCESS_LOG_DB;
  await ensureSchema(db);

  await db
    .prepare(
      `INSERT INTO monthly_stats (month_key, access_count, unique_client_count)
       VALUES (?, 0, 0)
       ON CONFLICT(month_key) DO NOTHING`
    )
    .bind(month)
    .run();

  await db
    .prepare("UPDATE monthly_stats SET access_count = access_count + 1 WHERE month_key = ?")
    .bind(month)
    .run();

  const existing = await db
    .prepare("SELECT access_count FROM monthly_clients WHERE month_key = ? AND client_id = ?")
    .bind(month, clientId)
    .first();

  await db
    .prepare(
      `INSERT INTO monthly_clients (month_key, client_id, access_count)
       VALUES (?, ?, 1)
       ON CONFLICT(month_key, client_id) DO UPDATE SET access_count = monthly_clients.access_count + 1`
    )
    .bind(month, clientId)
    .run();

  if (!existing) {
    await db
      .prepare("UPDATE monthly_stats SET unique_client_count = unique_client_count + 1 WHERE month_key = ?")
      .bind(month)
      .run();
  }

  return json({ ok: true });
}
