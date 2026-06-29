import { NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { getStripe } from "@/lib/stripe";

// POST /api/admin/orders/[orderId]/confirm — confirmer une commande en attente.
// Pour une commande "à la livraison": le stock est déduit ici directement.
// Pour une commande "en ligne" (carte autorisée mais pas encore prélevée): on
// capture d'abord le paiement Stripe, et ce n'est QUE si cette capture réussit
// que le stock est déduit — jamais avant, pour ne jamais facturer une carte
// sans pouvoir livrer la commande.
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
    sql: "SELECT status, total, stripe_payment_intent_id FROM orders WHERE id = ?",
    args: [orderId],
  });
  if (orderRes.rows.length === 0) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }
  const order = orderRes.rows[0];
  if (order.status !== "en_attente") {
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

  // Pour une commande payée par carte (capture manuelle), on doit capturer le
  // montant exact de la commande, qui ne peut jamais dépasser le montant
  // initialement autorisé par le client.
  const paymentIntentId = order.stripe_payment_intent_id as string | null;
  if (paymentIntentId) {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe n'est plus configuré, impossible de capturer ce paiement." },
        { status: 503 }
      );
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const amountToCapture = Math.round((order.total as number) * 100);

      if (amountToCapture > intent.amount) {
        return NextResponse.json(
          {
            error: `Le total de la commande (${(order.total as number).toFixed(2)} $) dépasse le montant autorisé par le client (${(intent.amount / 100).toFixed(2)} $). Réduis une quantité plutôt que de l'augmenter, ou refuse la commande et demande au client de repasser commande.`,
          },
          { status: 400 }
        );
      }

      await stripe.paymentIntents.capture(paymentIntentId, {
        amount_to_capture: amountToCapture,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la capture du paiement.";
      return NextResponse.json(
        { error: `Impossible de capturer le paiement Stripe: ${message}` },
        { status: 502 }
      );
    }
  }

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
          `Stock insuffisant pour "${item.product_name}" (${item.color_name}, ${item.length_value}). Disponible: ${available}, demandé: ${item.quantity}. Le paiement a déjà été capturé — contacte le client pour ajuster manuellement.`
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
