import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";

// PATCH /api/products/[id] — modifier nom, prix ou catégorie (admin seulement)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const updates: string[] = [];
  const args: (string | number)[] = [];

  if (typeof body?.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "Le nom ne peut pas être vide." },
        { status: 400 }
      );
    }
    updates.push("name = ?");
    args.push(trimmed);
  }

  if (typeof body?.pricePerUnit === "number") {
    if (body.pricePerUnit < 0) {
      return NextResponse.json(
        { error: "Le prix ne peut pas être négatif." },
        { status: 400 }
      );
    }
    updates.push("price_per_unit = ?");
    args.push(body.pricePerUnit);
  }

  if (typeof body?.categoryId === "string") {
    updates.push("category_id = ?");
    args.push(body.categoryId);
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { error: "Aucune donnée valide à mettre à jour." },
      { status: 400 }
    );
  }

  updates.push("updated_at = datetime('now')");
  const db = getDb();
  await db.execute({
    sql: `UPDATE products SET ${updates.join(", ")} WHERE id = ?`,
    args: [...args, id],
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/products/[id] — supprimer un produit (admin seulement)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const { id } = await params;
  const db = getDb();
  await db.execute({ sql: "DELETE FROM products WHERE id = ?", args: [id] });

  return NextResponse.json({ success: true });
}
