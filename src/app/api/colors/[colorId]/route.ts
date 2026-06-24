import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// DELETE /api/colors/[colorId] — retirer une couleur d'un produit
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ colorId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { colorId } = await params;
  const db = getDb();

  const colorRes = await db.execute({
    sql: "SELECT id, product_id as productId FROM colors WHERE id = ?",
    args: [colorId],
  });
  if (colorRes.rows.length === 0) {
    return NextResponse.json({ error: "Couleur introuvable." }, { status: 404 });
  }
  const productId = (colorRes.rows[0] as any).productId;

  const countRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM colors WHERE product_id = ?",
    args: [productId],
  });
  const count = Number((countRes.rows[0] as any).count);

  if (count <= 1) {
    return NextResponse.json(
      { error: "Un produit doit garder au moins une couleur." },
      { status: 400 }
    );
  }

  await db.execute({ sql: "DELETE FROM colors WHERE id = ?", args: [colorId] });
  return NextResponse.json({ success: true });
}
