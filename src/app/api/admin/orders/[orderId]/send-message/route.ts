import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { sendCustomerOrderEmail, isEmailConfigured } from "@/lib/email";

// POST /api/admin/orders/[orderId]/send-message — envoyer un message personnalisé
// au client par courriel (confirmation, refus, ou tout autre message lié à sa commande).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { orderId } = await params;
  const db = getDb();
  const body = await req.json().catch(() => null);

  const subject: string = body?.subject?.trim() || "";
  const message: string = body?.message?.trim() || "";

  if (!subject || !message) {
    return NextResponse.json(
      { error: "Le sujet et le message sont requis." },
      { status: 400 }
    );
  }

  const orderRes = await db.execute({
    sql: "SELECT customer_name, customer_email FROM orders WHERE id = ?",
    args: [orderId],
  });
  if (orderRes.rows.length === 0) {
    return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
  }

  const customerName = orderRes.rows[0].customer_name as string;
  const customerEmail = orderRes.rows[0].customer_email as string;

  if (!isEmailConfigured()) {
    return NextResponse.json(
      {
        error:
          "L'envoi de courriels n'est pas encore configuré sur ce site. Copie le message ci-dessus et envoie-le toi-même par courriel ou texto pour l'instant.",
      },
      { status: 503 }
    );
  }

  await sendCustomerOrderEmail({ customerEmail, customerName, subject, message });

  return NextResponse.json({ success: true });
}
