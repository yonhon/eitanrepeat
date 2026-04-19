function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function monthKeyFromParts(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function lastNMonths(count) {
  const out = [];
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(monthKeyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1));
  }
  return out;
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

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.ACCESS_LOG_DB) {
    return json({ ok: false, error: "db_binding_missing" }, 500);
  }
  const secret = String(env.LOG_HASH_SECRET || "");
  if (!secret) {
    return json({ ok: false, error: "log_hash_secret_missing" }, 500);
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("months") || 12);
  const months = Math.max(1, Math.min(60, Number.isFinite(requested) ? Math.floor(requested) : 12));
  const monthKeys = lastNMonths(months);

  const db = env.ACCESS_LOG_DB;
  await ensureSchema(db);

  const placeholders = monthKeys.map(() => "?").join(",");
  const sql = `SELECT month_key, client_id, access_count
               FROM monthly_clients
               WHERE month_key IN (${placeholders})
               ORDER BY month_key DESC, access_count DESC, client_id ASC`;
  const rs = await db.prepare(sql).bind(...monthKeys).all();
  const rowsRaw = Array.isArray(rs?.results) ? rs.results : [];
  const monthMap = new Map(monthKeys.map((m) => [m, []]));
  for (const row of rowsRaw) {
    const month = String(row.month_key || "");
    if (!monthMap.has(month)) continue;
    const rawClientId = String(row.client_id || "");
    const clientHash = await sha256Hex(rawClientId + secret);
    monthMap.get(month).push({
      clientId: clientHash,
      accessCount: Number(row.access_count || 0),
    });
  }

  const rows = monthKeys
    .slice()
    .reverse()
    .map((m) => ({
      month: m,
      clients: monthMap.get(m) || [],
    }));

  return json({ ok: true, months, rows });
}
