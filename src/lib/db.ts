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
  status TEXT NOT NULL DEFAULT 'en_attente',
  total REAL NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  color_id TEXT,
  color_name TEXT NOT NULL,
  length_option_id TEXT,
  length_value REAL NOT NULL,
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

// Colonnes ajoutées après le premier lancement du site — nécessaires pour les
// bases de données déjà existantes (SQLite ignore une colonne déjà présente
// en renvoyant une erreur qu'on attrape simplement).
const MIGRATIONS = [
  "ALTER TABLE orders ADD COLUMN customer_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN customer_email TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN customer_phone TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE orders ADD COLUMN confirmed_at TEXT",
  "ALTER TABLE order_items ADD COLUMN product_id TEXT",
  "ALTER TABLE order_items ADD COLUMN color_id TEXT",
  "ALTER TABLE order_items ADD COLUMN length_option_id TEXT",
  // "length" est un mot réservé en SQL (fonction LENGTH()) qui causait des
  // bogues de lecture silencieux — on migre vers "length_value" à la place.
  "ALTER TABLE order_items ADD COLUMN length_value REAL",
  'UPDATE order_items SET length_value = "length" WHERE length_value IS NULL',
  // On retire l'ancienne colonne "length": sa contrainte NOT NULL bloquerait
  // sinon toute nouvelle commande, puisque le code n'y écrit plus du tout.
  "ALTER TABLE order_items DROP COLUMN length",
  "ALTER TABLE orders ADD COLUMN stripe_payment_intent_id TEXT",
];

export async function ensureSchema() {
  if (initialized) return;
  const db = getDb();
  const statements = SCHEMA.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
  for (const migration of MIGRATIONS) {
    try {
      await db.execute(migration);
    } catch {
      // La colonne existe déjà — rien à faire, c'est normal après la première migration.
    }
  }
  initialized = true;
}

export function newId(prefix: string = ""): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}${random}`;
}
