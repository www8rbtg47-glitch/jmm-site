/**
 * Script de seed: s'exécute une seule fois pour préparer la base de données.
 * - Crée le compte admin à partir de ADMIN_USERNAME / ADMIN_PASSWORD (.env)
 * - Crée des catégories et unités de départ typiques pour la ferblanterie
 *
 * Lancer avec: npm run seed
 */
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { ensureSchema, getDb, newId } from "../src/lib/db";

// Charge les variables du fichier .env (chargeur minimal, sans dépendance externe)
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

async function main() {
  await ensureSchema();
  const db = getDb();

  // --- Compte admin ---
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error(
      "ADMIN_USERNAME et ADMIN_PASSWORD doivent être définis dans .env avant de lancer le seed."
    );
    process.exit(1);
  }

  const existing = await db.execute({
    sql: "SELECT id FROM admin_users WHERE username = ?",
    args: [username],
  });

  if (existing.rows.length > 0) {
    console.log(`Le compte admin "${username}" existe déjà — aucun changement.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.execute({
      sql: "INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)",
      args: [newId("admin_"), username, passwordHash],
    });
    console.log(`Compte admin "${username}" créé avec succès.`);
  }

  // --- Catégories de départ ---
  const categories = ["Tôle", "Gouttière", "Accessoire"];
  for (const label of categories) {
    const found = await db.execute({
      sql: "SELECT id FROM categories WHERE label = ?",
      args: [label],
    });
    if (found.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO categories (id, label) VALUES (?, ?)",
        args: [newId("cat_"), label],
      });
      console.log(`Catégorie créée: ${label}`);
    }
  }

  // --- Unités de départ ---
  const units = [
    { label: "Pieds" },
    { label: "Unité" },
  ];
  for (const u of units) {
    const found = await db.execute({
      sql: "SELECT id FROM units WHERE label = ?",
      args: [u.label],
    });
    if (found.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO units (id, label) VALUES (?, ?)",
        args: [newId("unit_"), u.label],
      });
      console.log(`Unité créée: ${u.label}`);
    }
  }

  console.log("Seed terminé.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Erreur pendant le seed:", err);
  process.exit(1);
});
