import { NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import type { OrderDTO } from "@/lib/types";

// GET /api/admin/orders — liste toutes les commandes, les plus récentes en premier.
export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const db = getDb();

  const ordersRes = await db.execute(
    "SELECT * FROM orders ORDER BY created_at DESC"
  );
  const itemsRes = await db.execute("SELECT * FROM order_items");

  const orders: OrderDTO[] = ordersRes.rows.map((o) => ({
    id: o.id as string,
    status: o.status as OrderDTO["status"],
    paymentMethod: o.payment_method as string,
    total: o.total as number,
    customerName: o.customer_name as string,
    customerEmail: o.customer_email as string,
    customerPhone: o.customer_phone as string,
    adminNote: o.admin_note as string,
    createdAt: o.created_at as string,
    confirmedAt: (o.confirmed_at as string) || null,
    items: itemsRes.rows
      .filter((i) => i.order_id === o.id)
      .map((i) => ({
        id: i.id as string,
        productId: (i.product_id as string) || null,
        productName: i.product_name as string,
        colorId: (i.color_id as string) || null,
        colorName: i.color_name as string,
        lengthOptionId: (i.length_option_id as string) || null,
        length: i.length_value as number,
        quantity: i.quantity as number,
        pricePerUnit: i.price_per_unit as number,
      })),
  }));

  return NextResponse.json(orders);
}
