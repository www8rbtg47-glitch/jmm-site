import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// PATCH /api/admin/orders/[orderId] — ajuster une commande en attente
// (note admin) avant de la confirmer ou de la refuser.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { orderId } = await params;
  const db = getDb();
  const body = await req.json().catch(() => null);

  const orderRes = await db.execute({
    sql: "SELECT status FROM orders WHERE id = ?",
    args: [orderId],
  });
  if (orderRes.rows.length === 0) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }
  if (orderRes.rows[0].status !== "en_attente") {
    return NextResponse.json(
      { error: "Cette commande a déjà été traitée et ne peut plus être ajustée." },
      { status: 400 }
    );
  }

  if (typeof body?.adminNote === "string") {
    await db.execute({
      sql: "UPDATE orders SET admin_note = ? WHERE id = ?",
      args: [body.adminNote, orderId],
    });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/orders/[orderId] — supprimer une commande (par exemple un test,
// ou une commande déjà traitée hors du système).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { orderId } = await params;
  const db = getDb();
  await db.execute({ sql: "DELETE FROM orders WHERE id = ?", args: [orderId] });
  return NextResponse.json({ success: true });
}
