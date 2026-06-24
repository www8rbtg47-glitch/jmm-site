import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { CartItemDTO } from "@/lib/types";

// POST /api/orders — confirmer une commande "paiement à la livraison" et déduire le stock.
// Pour le paiement en ligne par carte, voir /api/checkout (le stock n'y est déduit
// qu'après confirmation réelle du paiement, via le webhook Stripe).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const items: CartItemDTO[] = body?.items;
  const paymentMethod: string = body?.paymentMethod;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Le panier est vide." }, { status: 400 });
  }
  if (paymentMethod !== "livraison") {
    return NextResponse.json(
      {
        error:
          "Cette route ne traite que le paiement à la livraison. Utilise /api/checkout pour le paiement en ligne.",
      },
      { status: 400 }
    );
  }

  await ensureSchema();
  const db = getDb();

  // Transaction: on vérifie ET déduit le stock dans la même opération atomique,
  // pour qu'il soit impossible que deux clients vendent la dernière unité en même temps.
  const tx = await db.transaction("write");
  try {
    for (const item of items) {
      const res = await tx.execute({
        sql: `SELECT quantity FROM stock WHERE color_id = ? AND length_option_id = ?`,
        args: [item.colorId, item.lengthOptionId],
      });
      const available = (res.rows[0]?.quantity as number) ?? 0;
      if (available < item.quantity) {
        throw new Error(
          `Stock insuffisant pour "${item.productName}" (${item.colorName}, ${item.length}). Disponible: ${available}, demandé: ${item.quantity}.`
        );
      }
    }

    for (const item of items) {
      await tx.execute({
        sql: `UPDATE stock SET quantity = quantity - ? WHERE color_id = ? AND length_option_id = ?`,
        args: [item.quantity, item.colorId, item.lengthOptionId],
      });
    }

    const total = items.reduce(
      (sum, item) => sum + item.pricePerUnit * item.length * item.quantity,
      0
    );
    const roundedTotal = Math.round(total * 100) / 100;
    const orderId = newId("ord_");

    await tx.execute({
      sql: `INSERT INTO orders (id, payment_method, total) VALUES (?, ?, ?)`,
      args: [orderId, paymentMethod, roundedTotal],
    });

    for (const item of items) {
      await tx.execute({
        sql: `INSERT INTO order_items (id, order_id, product_name, color_name, length, quantity, price_per_unit)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          newId("item_"),
          orderId,
          item.productName,
          item.colorName,
          item.length,
          item.quantity,
          item.pricePerUnit,
        ],
      });
    }

    await tx.commit();
    return NextResponse.json({ success: true, orderId });
  } catch (err) {
    await tx.rollback();
    const message =
      err instanceof Error ? err.message : "Erreur lors de la commande.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
