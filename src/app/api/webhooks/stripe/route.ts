import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { CartItemDTO } from "@/lib/types";
import Stripe from "stripe";

// POST /api/webhooks/stripe — appelé par Stripe quand un paiement est confirmé.
// C'est ICI (et seulement ici) que le stock est déduit pour un paiement en ligne,
// pour être certain que l'argent a vraiment été reçu avant de retirer le stock.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe non configuré." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      // Pas de secret configuré: on fait confiance au corps brut (à éviter en prod réelle,
      // mais permet de tester rapidement avant d'avoir configuré le secret de webhook).
      event = JSON.parse(rawBody);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature invalide";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const pendingCheckoutId = session.metadata?.pendingCheckoutId;
  if (!pendingCheckoutId) {
    return NextResponse.json({ received: true });
  }

  await ensureSchema();
  const db = getDb();

  const pendingRes = await db.execute({
    sql: `SELECT items_json, total, status FROM pending_checkouts WHERE id = ?`,
    args: [pendingCheckoutId],
  });
  const pending = pendingRes.rows[0];
  if (!pending || pending.status === "complete") {
    // Déjà traité (Stripe peut renvoyer le même événement plusieurs fois) ou introuvable.
    return NextResponse.json({ received: true });
  }

  const items: CartItemDTO[] = JSON.parse(pending.items_json as string);
  const total = pending.total as number;

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
          `Stock insuffisant pour "${item.productName}" au moment de confirmer le paiement.`
        );
      }
    }

    for (const item of items) {
      await tx.execute({
        sql: `UPDATE stock SET quantity = quantity - ? WHERE color_id = ? AND length_option_id = ?`,
        args: [item.quantity, item.colorId, item.lengthOptionId],
      });
    }

    const orderId = newId("ord_");
    await tx.execute({
      sql: `INSERT INTO orders (id, payment_method, status, total, confirmed_at) VALUES (?, 'en_ligne', 'confirmee', ?, datetime('now'))`,
      args: [orderId, total],
    });

    for (const item of items) {
      await tx.execute({
        sql: `INSERT INTO order_items (id, order_id, product_id, product_name, color_id, color_name, length_option_id, length_value, quantity, price_per_unit)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          newId("item_"),
          orderId,
          item.productId,
          item.productName,
          item.colorId,
          item.colorName,
          item.lengthOptionId,
          item.length,
          item.quantity,
          item.pricePerUnit,
        ],
      });
    }

    await tx.execute({
      sql: `UPDATE pending_checkouts SET status = 'complete' WHERE id = ?`,
      args: [pendingCheckoutId],
    });

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    await db.execute({
      sql: `UPDATE pending_checkouts SET status = 'erreur_stock' WHERE id = ?`,
      args: [pendingCheckoutId],
    });
    console.error("Erreur lors de la confirmation de commande Stripe:", err);
  }

  return NextResponse.json({ received: true });
}
