import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { CartItemDTO } from "@/lib/types";
import Stripe from "stripe";

// POST /api/webhooks/stripe — appelé par Stripe quand le client a autorisé son
// paiement (capture_method: manual, donc l'argent n'est pas encore prélevé).
// On crée ici une commande "en_attente", exactement comme pour le paiement à la
// livraison: l'admin doit l'ajuster et la confirmer dans /admin/orders. Ce n'est
// QUE lors de cette confirmation que le paiement est réellement capturé et que
// le stock est déduit — jamais ici.
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

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

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
  const customerEmail = session.customer_details?.email || "";
  const customerName = session.customer_details?.name || "";
  const customerPhone = session.customer_details?.phone || "";

  try {
    const orderId = newId("ord_");
    await db.execute({
      sql: `INSERT INTO orders
            (id, payment_method, status, total, customer_name, customer_email, customer_phone, stripe_payment_intent_id)
            VALUES (?, 'en_ligne', 'en_attente', ?, ?, ?, ?, ?)`,
      args: [orderId, total, customerName, customerEmail, customerPhone, paymentIntentId ?? null],
    });

    for (const item of items) {
      await db.execute({
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

    await db.execute({
      sql: `UPDATE pending_checkouts SET status = 'complete' WHERE id = ?`,
      args: [pendingCheckoutId],
    });

    // Avertir l'administrateur, comme pour une commande à la livraison.
    try {
      const { sendAdminNewOrderEmail } = await import("@/lib/email");
      await sendAdminNewOrderEmail({
        orderId,
        customerName,
        customerEmail,
        customerPhone,
        total,
        items,
      });
    } catch (err) {
      console.error("Erreur lors de l'envoi du courriel de nouvelle commande (Stripe):", err);
    }
  } catch (err) {
    console.error("Erreur lors de l'enregistrement de la commande Stripe:", err);
  }

  return NextResponse.json({ received: true });
}
