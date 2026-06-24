import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// DELETE /api/lengths/[lengthId] — retirer une longueur d'un produit
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ lengthId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { lengthId } = await params;
  const db = getDb();

  const lengthRes = await db.execute({
    sql: "SELECT id, product_id as productId FROM length_options WHERE id = ?",
    args: [lengthId],
  });
  if (lengthRes.rows.length === 0) {
    return NextResponse.json({ error: "Longueur introuvable." }, { status: 404 });
  }
  const productId = (lengthRes.rows[0] as any).productId;

  const countRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM length_options WHERE product_id = ?",
    args: [productId],
  });
  const count = Number((countRes.rows[0] as any).count);

  if (count <= 1) {
    return NextResponse.json(
      { error: "Un produit doit garder au moins une longueur disponible." },
      { status: 400 }
    );
  }

  await db.execute({ sql: "DELETE FROM length_options WHERE id = ?", args: [lengthId] });
  return NextResponse.json({ success: true });
}
