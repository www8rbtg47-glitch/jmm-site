import { NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { getStripe } from "@/lib/stripe";

// POST /api/admin/orders/[orderId]/refuse — refuser une commande en attente.
// Le stock n'a jamais été déduit pour une commande en attente, donc il n'y a
// rien à remettre en stock ici. Si la commande a été payée par carte (autorisée
// mais jamais capturée), on annule aussi cette autorisation: le client ne sera
// jamais chargé, pas besoin de remboursement.
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
    sql: "SELECT status, stripe_payment_intent_id FROM orders WHERE id = ?",
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

  const paymentIntentId = order.stripe_payment_intent_id as string | null;
  if (paymentIntentId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        await stripe.paymentIntents.cancel(paymentIntentId);
      } catch (err) {
        // Si l'annulation échoue (par exemple déjà annulée côté Stripe), on continue
        // quand même à marquer la commande comme refusée plutôt que de bloquer l'admin.
        console.error("Erreur lors de l'annulation de l'autorisation Stripe:", err);
      }
    }
  }

  await db.execute({
    sql: "UPDATE orders SET status = 'refusee' WHERE id = ?",
    args: [orderId],
  });

  return NextResponse.json({ success: true });
}
