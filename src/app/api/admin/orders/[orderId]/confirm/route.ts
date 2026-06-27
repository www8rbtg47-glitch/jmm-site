import { NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// POST /api/admin/orders/[orderId]/confirm — confirmer une commande en attente.
// C'est ICI (et seulement ici, pour le paiement à la livraison) que le stock
// est déduit, après que l'admin ait vérifié et ajusté la commande au besoin.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { orderId } = await params;
  const db = getDb();

  const orderRes = await db.execute({
    sql: "SELECT status FROM orders WHERE id = ?",
    args: [orderId],
  });
  if (orderRes.rows.length === 0) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }
  if (orderRes.rows[0].status !== "en_attente") {
    return NextResponse.json(
      { error: "Cette commande a déjà été confirmée ou refusée." },
      { status: 400 }
    );
  }

  const itemsRes = await db.execute({
    sql: "SELECT * FROM order_items WHERE order_id = ?",
    args: [orderId],
  });
  const items = itemsRes.rows;

  const tx = await db.transaction("write");
  try {
    for (const item of items) {
      const colorId = item.color_id as string | null;
      const lengthOptionId = item.length_option_id as string | null;
      if (!colorId || !lengthOptionId) continue; // article ajouté manuellement, pas lié au stock

      const res = await tx.execute({
        sql: "SELECT quantity FROM stock WHERE color_id = ? AND length_option_id = ?",
        args: [colorId, lengthOptionId],
      });
      const available = (res.rows[0]?.quantity as number) ?? 0;
      if (available < (item.quantity as number)) {
        throw new Error(
          `Stock insuffisant pour "${item.product_name}" (${item.color_name}, ${item.length_value}). Disponible: ${available}, demandé: ${item.quantity}. Ajuste la quantité avant de confirmer.`
        );
      }
    }

    for (const item of items) {
      const colorId = item.color_id as string | null;
      const lengthOptionId = item.length_option_id as string | null;
      if (!colorId || !lengthOptionId) continue;

      await tx.execute({
        sql: "UPDATE stock SET quantity = quantity - ? WHERE color_id = ? AND length_option_id = ?",
        args: [item.quantity, colorId, lengthOptionId],
      });
    }

    await tx.execute({
      sql: "UPDATE orders SET status = 'confirmee', confirmed_at = datetime('now') WHERE id = ?",
      args: [orderId],
    });

    await tx.commit();
    return NextResponse.json({ success: true });
  } catch (err) {
    await tx.rollback();
    const message = err instanceof Error ? err.message : "Erreur lors de la confirmation.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
