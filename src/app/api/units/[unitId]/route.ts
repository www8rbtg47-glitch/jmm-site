import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// DELETE /api/units/[unitId] — supprimer une unité de mesure,
// seulement si aucun produit ne l'utilise actuellement.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { unitId } = await params;
  const db = getDb();

  const unitRes = await db.execute({
    sql: "SELECT id, label FROM units WHERE id = ?",
    args: [unitId],
  });
  if (unitRes.rows.length === 0) {
    return NextResponse.json({ error: "Unité introuvable." }, { status: 404 });
  }
  const label = unitRes.rows[0].label as string;

  const usageRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM products WHERE unit_id = ?",
    args: [unitId],
  });
  const count = Number(usageRes.rows[0].count);

  if (count > 0) {
    return NextResponse.json(
      {
        error: `Impossible de supprimer "${label}" — cette unité est utilisée par ${count} produit${count > 1 ? "s" : ""}. Change l'unité de ce${count > 1 ? "s" : ""} produit${count > 1 ? "s" : ""} avant de la supprimer.`,
      },
      { status: 400 }
    );
  }

  await db.execute({ sql: "DELETE FROM units WHERE id = ?", args: [unitId] });
  return NextResponse.json({ success: true });
}
