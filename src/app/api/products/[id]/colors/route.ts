import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// POST /api/products/[id]/colors — ajouter une nouvelle couleur à un produit
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const hex = body?.hex;
  const startStock = Math.max(0, Number(body?.startStock) || 0);

  if (!name || !hex) {
    return NextResponse.json(
      { error: "Le nom et la teinte de la couleur sont requis." },
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

  const colorId = newId("col_");
  await db.execute({
    sql: "INSERT INTO colors (id, name, hex, product_id) VALUES (?, ?, ?, ?)",
    args: [colorId, name, hex, id],
  });

  // Créer une entrée de stock pour chaque longueur existante du produit
  const lengthsRes = await db.execute({
    sql: "SELECT id FROM length_options WHERE product_id = ?",
    args: [id],
  });

  for (const row of lengthsRes.rows as any[]) {
    await db.execute({
      sql: `INSERT INTO stock (id, quantity, product_id, color_id, length_option_id)
            VALUES (?, ?, ?, ?, ?)`,
      args: [newId("stk_"), startStock, id, colorId, row.id],
    });
  }

  return NextResponse.json({ success: true, colorId });
}
