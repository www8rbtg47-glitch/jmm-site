import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

async function ensureOrderIsPending(orderId: string) {
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT status FROM orders WHERE id = ?",
    args: [orderId],
  });
  if (res.rows.length === 0) return "Commande introuvable.";
  if (res.rows[0].status !== "en_attente") {
    return "Cette commande a déjà été traitée et ne peut plus être ajustée.";
  }
  return null;
}

async function recomputeOrderTotal(orderId: string) {
  const db = getDb();
  const itemsRes = await db.execute({
    sql: "SELECT length_value as lengthValue, quantity, price_per_unit as pricePerUnit FROM order_items WHERE order_id = ?",
    args: [orderId],
  });
  const total = itemsRes.rows.reduce(
    (sum, i) => sum + (i.lengthValue as number) * (i.quantity as number) * (i.pricePerUnit as number),
    0
  );
  await db.execute({
    sql: "UPDATE orders SET total = ? WHERE id = ?",
    args: [Math.round(total * 100) / 100, orderId],
  });
}

// PATCH /api/admin/orders/[orderId]/items/[itemId] — changer la quantité d'un article
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; itemId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { orderId, itemId } = await params;
  const errorMsg = await ensureOrderIsPending(orderId);
  if (errorMsg) {
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const quantity = Number(body?.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json(
      { error: "La quantité doit être un nombre d'au moins 1." },
      { status: 400 }
    );
  }

  const db = getDb();
  await db.execute({
    sql: "UPDATE order_items SET quantity = ? WHERE id = ? AND order_id = ?",
    args: [quantity, itemId, orderId],
  });
  await recomputeOrderTotal(orderId);

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/orders/[orderId]/items/[itemId] — retirer un article de la commande
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string; itemId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { orderId, itemId } = await params;
  const errorMsg = await ensureOrderIsPending(orderId);
  if (errorMsg) {
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  const db = getDb();

  const countRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM order_items WHERE order_id = ?",
    args: [orderId],
  });
  if (Number(countRes.rows[0].count) <= 1) {
    return NextResponse.json(
      { error: "Une commande doit garder au moins un article. Refuse la commande au complet plutôt." },
      { status: 400 }
    );
  }

  await db.execute({
    sql: "DELETE FROM order_items WHERE id = ? AND order_id = ?",
    args: [itemId, orderId],
  });
  await recomputeOrderTotal(orderId);

  return NextResponse.json({ success: true });
}
