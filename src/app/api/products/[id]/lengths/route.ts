import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// POST /api/products/[id]/lengths — ajouter une nouvelle longueur à un produit
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const value = Number(body?.value);

  if (!value || value <= 0) {
    return NextResponse.json(
      { error: "La longueur doit être un nombre positif." },
      { status: 400 }
    );
  }

  const db = getDb();

  const productRes = await db.execute({
    sql: "SELECT id FROM products WHERE id = ?",
    args: [id],
  });
  if (productRes.rows.length === 0) {
    return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  }

  const existingLengths = await db.execute({
    sql: "SELECT value FROM length_options WHERE product_id = ?",
    args: [id],
  });
  if (existingLengths.rows.some((l: any) => l.value === value)) {
    return NextResponse.json(
      { error: "Cette longueur existe déjà pour ce produit." },
      { status: 400 }
    );
  }

  const lengthId = newId("len_");
  await db.execute({
    sql: "INSERT INTO length_options (id, value, product_id) VALUES (?, ?, ?)",
    args: [lengthId, value, id],
  });

  const colorsRes = await db.execute({
    sql: "SELECT id FROM colors WHERE product_id = ?",
    args: [id],
  });

  for (const row of colorsRes.rows as any[]) {
    await db.execute({
      sql: `INSERT INTO stock (id, quantity, product_id, color_id, length_option_id)
            VALUES (?, ?, ?, ?, ?)`,
      args: [newId("stk_"), 0, id, row.id, lengthId],
    });
  }

  return NextResponse.json({ success: true, lengthOptionId: lengthId });
}
