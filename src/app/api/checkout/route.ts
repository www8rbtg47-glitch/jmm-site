import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { CartItemDTO } from "@/lib/types";

// POST /api/checkout — crée une session de paiement Stripe pour le panier.
// Le stock n'est PAS déduit ici: il l'est seulement quand Stripe confirme
// le paiement via le webhook, pour éviter de bloquer du stock si le client
// abandonne sur la page de paiement.
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Le paiement en ligne par carte n'est pas encore configuré sur ce site. Utilise « payer à la livraison » pour l'instant, ou configure STRIPE_SECRET_KEY dans .env.",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const items: CartItemDTO[] = body?.items;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Le panier est vide." }, { status: 400 });
  }

  await ensureSchema();
  const db = getDb();
  const stripe = getStripe()!;

  // Vérification de stock préalable (avant de créer la session de paiement),
  // pour ne pas envoyer le client payer quelque chose qui n'est plus disponible.
  for (const item of items) {
    const res = await db.execute({
      sql: `SELECT quantity FROM stock WHERE color_id = ? AND length_option_id = ?`,
      args: [item.colorId, item.lengthOptionId],
    });
    const available = (res.rows[0]?.quantity as number) ?? 0;
    if (available < item.quantity) {
      return NextResponse.json(
        {
          error: `Stock insuffisant pour "${item.productName}" (${item.colorName}, ${item.length}). Disponible: ${available}, demandé: ${item.quantity}.`,
        },
        { status: 409 }
      );
    }
  }

  const total = items.reduce(
    (sum, item) => sum + item.pricePerUnit * item.length * item.quantity,
    0
  );
  const roundedTotal = Math.round(total * 100) / 100;
  const pendingId = newId("pending_");

  await db.execute({
    sql: `INSERT INTO pending_checkouts (id, items_json, total) VALUES (?, ?, ?)`,
    args: [pendingId, JSON.stringify(items), roundedTotal],
  });

  const origin = req.headers.get("origin") || new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      payment_intent_data: {
        capture_method: "manual",
      },
      line_items: items.map((item) => ({
        price_data: {
          currency: "cad",
          product_data: {
            name: `${item.productName} — ${item.colorName}, ${item.length}`,
          },
          unit_amount: Math.round(item.pricePerUnit * item.length * 100),
        },
        quantity: item.quantity,
      })),
      success_url: `${origin}/?commande=succes`,
      cancel_url: `${origin}/?commande=annulee`,
      metadata: { pendingCheckoutId: pendingId },
    });

    await db.execute({
      sql: `UPDATE pending_checkouts SET stripe_session_id = ? WHERE id = ?`,
      args: [session.id, pendingId],
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // La session de paiement n'a pas pu être créée (clé Stripe invalide, panne réseau, etc.)
    // — on nettoie l'entrée en attente puisqu'elle ne sera jamais payée.
    await db.execute({
      sql: `DELETE FROM pending_checkouts WHERE id = ?`,
      args: [pendingId],
    });
    const message =
      err instanceof Error
        ? `Impossible de démarrer le paiement en ligne (${err.message}). Réessaie ou utilise « payer à la livraison ».`
        : "Impossible de démarrer le paiement en ligne. Réessaie ou utilise « payer à la livraison ».";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
