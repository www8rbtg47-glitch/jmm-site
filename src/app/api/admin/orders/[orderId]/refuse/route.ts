import { NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// POST /api/admin/orders/[orderId]/refuse — refuser une commande en attente.
// Le stock n'a jamais été déduit pour une commande en attente, donc il n'y a
// rien à remettre en stock ici — on marque juste la commande comme refusée.
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

  await db.execute({
    sql: "UPDATE orders SET status = 'refusee' WHERE id = ?",
    args: [orderId],
  });

  return NextResponse.json({ success: true });
}
