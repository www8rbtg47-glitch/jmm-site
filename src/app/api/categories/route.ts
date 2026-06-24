import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute("SELECT id, label FROM categories ORDER BY label ASC");
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const body = await req.json().catch(() => null);
  const label = body?.label?.trim();
  if (!label) {
    return NextResponse.json({ error: "Le nom de la catégorie est requis." }, { status: 400 });
  }

  const db = getDb();
  const id = newId("cat_");
  await db.execute({
    sql: "INSERT INTO categories (id, label) VALUES (?, ?)",
    args: [id, label],
  });
  return NextResponse.json({ id, label });
}
