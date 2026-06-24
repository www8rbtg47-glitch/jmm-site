import { createClient, Client } from "@libsql/client";

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.DATABASE_URL || "file:./dev.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN; // requis seulement avec Turso cloud

  client = createClient(
    authToken ? { url, authToken } : { url }
  );
  return client;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_per_unit REAL NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  unit_id TEXT NOT NULL REFERENCES units(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS colors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hex TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS length_options (
  id TEXT PRIMARY KEY,
  value REAL NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock (
  id TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL DEFAULT 0,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_id TEXT NOT NULL REFERENCES colors(id) ON DELETE CASCADE,
  length_option_id TEXT NOT NULL REFERENCES length_options(id) ON DELETE CASCADE,
  UNIQUE(color_id, length_option_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmee',
  total REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  color_name TEXT NOT NULL,
  length REAL NOT NULL,
  quantity INTEGER NOT NULL,
  price_per_unit REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_checkouts (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT UNIQUE,
  items_json TEXT NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_attente',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;
  const db = getDb();
  const statements = SCHEMA.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
  initialized = true;
}

export function newId(prefix: string = ""): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}${random}`;
}
