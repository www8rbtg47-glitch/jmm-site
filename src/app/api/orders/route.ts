import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { CartItemDTO } from "@/lib/types";

// POST /api/orders — enregistrer une nouvelle commande "paiement à la livraison"
// en attente de confirmation. Le stock n'est PAS déduit ici: il l'est seulement
// quand l'admin confirme la commande dans le panneau de gestion, après l'avoir
// vérifiée et ajustée au besoin.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const items: CartItemDTO[] = body?.items;
  const paymentMethod: string = body?.paymentMethod;
  const customerName: string = body?.customerName?.trim() || "";
  const customerEmail: string = body?.customerEmail?.trim() || "";
  const customerPhone: string = body?.customerPhone?.trim() || "";

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
  if (!customerName || !customerEmail || !customerPhone) {
    return NextResponse.json(
      { error: "Le nom, le courriel et le téléphone sont requis pour passer une commande." },
      { status: 400 }
    );
  }

  await ensureSchema();
  const db = getDb();

  // On vérifie que chaque article a au moins un peu de stock disponible,
  // pour éviter de créer une commande pour quelque chose de complètement
  // épuisé — mais on ne déduit rien tout de suite.
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
  const orderId = newId("ord_");

  await db.execute({
    sql: `INSERT INTO orders (id, payment_method, status, total, customer_name, customer_email, customer_phone)
          VALUES (?, ?, 'en_attente', ?, ?, ?, ?)`,
    args: [orderId, paymentMethod, roundedTotal, customerName, customerEmail, customerPhone],
  });

  for (const item of items) {
    await db.execute({
      sql: `INSERT INTO order_items
            (id, order_id, product_id, product_name, color_id, color_name, length_option_id, length_value, quantity, price_per_unit)
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

  // Avertir l'administrateur par courriel qu'une nouvelle commande attend une confirmation.
  // On utilise after() pour que cet envoi s'exécute après que la réponse soit envoyée
  // au client, mais sans risquer que la plateforme d'hébergement coupe l'exécution
  // avant la fin (ce qui arriverait avec un simple appel "sans attendre").
  after(async () => {
    try {
      const { sendAdminNewOrderEmail } = await import("@/lib/email");
      await sendAdminNewOrderEmail({
        orderId,
        customerName,
        customerEmail,
        customerPhone,
        total: roundedTotal,
        items,
      });
    } catch (err) {
      console.error("Erreur lors de l'envoi du courriel de nouvelle commande:", err);
    }
  });

  return NextResponse.json({ success: true, orderId });
}
