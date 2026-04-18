CREATE TABLE IF NOT EXISTS monthly_stats (
  month_key TEXT PRIMARY KEY,
  access_count INTEGER NOT NULL DEFAULT 0,
  unique_client_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS monthly_clients (
  month_key TEXT NOT NULL,
  client_id TEXT NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(month_key, client_id)
);
