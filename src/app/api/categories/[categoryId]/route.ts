import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// DELETE /api/categories/[categoryId] — supprimer une catégorie,
// seulement si aucun produit ne l'utilise actuellement.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { categoryId } = await params;
  const db = getDb();

  const catRes = await db.execute({
    sql: "SELECT id, label FROM categories WHERE id = ?",
    args: [categoryId],
  });
  if (catRes.rows.length === 0) {
    return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 });
  }
  const label = catRes.rows[0].label as string;

  const usageRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM products WHERE category_id = ?",
    args: [categoryId],
  });
  const count = Number(usageRes.rows[0].count);

  if (count > 0) {
    return NextResponse.json(
      {
        error: `Impossible de supprimer "${label}" — cette catégorie est utilisée par ${count} produit${count > 1 ? "s" : ""}. Change la catégorie de ce${count > 1 ? "s" : ""} produit${count > 1 ? "s" : ""} avant de la supprimer.`,
      },
      { status: 400 }
    );
  }

  await db.execute({ sql: "DELETE FROM categories WHERE id = ?", args: [categoryId] });
  return NextResponse.json({ success: true });
}
