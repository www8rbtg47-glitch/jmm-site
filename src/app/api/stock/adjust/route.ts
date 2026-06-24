import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// POST /api/stock/adjust — ajuster (ou définir) le stock d'une combinaison précise
// body: { productId, colorId, lengthOptionId, delta } OU { ..., setTo }
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const body = await req.json().catch(() => null);
  const { productId, colorId, lengthOptionId, delta, setTo } = body ?? {};

  if (!productId || !colorId || !lengthOptionId) {
    return NextResponse.json(
      { error: "productId, colorId et lengthOptionId sont requis." },
      { status: 400 }
    );
  }

  const db = getDb();
  const existingRes = await db.execute({
    sql: "SELECT id, quantity FROM stock WHERE color_id = ? AND length_option_id = ?",
    args: [colorId, lengthOptionId],
  });
  const existing = existingRes.rows[0] as any;

  let newQuantity: number;
  if (typeof setTo === "number") {
    newQuantity = Math.max(0, Math.round(setTo));
  } else {
    const current = existing?.quantity ?? 0;
    newQuantity = Math.max(0, current + (Number(delta) || 0));
  }

  if (existing) {
    await db.execute({
      sql: "UPDATE stock SET quantity = ? WHERE id = ?",
      args: [newQuantity, existing.id],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO stock (id, quantity, product_id, color_id, length_option_id)
            VALUES (?, ?, ?, ?, ?)`,
      args: [newId("stk_"), newQuantity, productId, colorId, lengthOptionId],
    });
  }

  return NextResponse.json({ success: true, quantity: newQuantity });
}
