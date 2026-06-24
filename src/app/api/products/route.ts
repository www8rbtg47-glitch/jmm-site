import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getDb, newId } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { ProductDTO } from "@/lib/types";

// GET /api/products — liste publique du catalogue
export async function GET() {
  await ensureSchema();
  const db = getDb();

  const [productsRes, colorsRes, lengthsRes, stockRes] = await Promise.all([
    db.execute(`
      SELECT p.id, p.name, p.description, p.price_per_unit as pricePerUnit,
             p.category_id as categoryId, c.label as categoryLabel,
             p.unit_id as unitId, u.label as unitLabel
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN units u ON u.id = p.unit_id
      ORDER BY p.created_at ASC
    `),
    db.execute("SELECT id, name, hex, product_id as productId FROM colors"),
    db.execute("SELECT id, value, product_id as productId FROM length_options"),
    db.execute("SELECT color_id as colorId, length_option_id as lengthOptionId, quantity FROM stock"),
  ]);

  const products: ProductDTO[] = productsRes.rows.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    pricePerUnit: p.pricePerUnit,
    categoryId: p.categoryId,
    categoryLabel: p.categoryLabel,
    unitId: p.unitId,
    unitLabel: p.unitLabel,
    colors: colorsRes.rows
      .filter((c: any) => c.productId === p.id)
      .map((c: any) => ({ id: c.id, name: c.name, hex: c.hex })),
    lengths: lengthsRes.rows
      .filter((l: any) => l.productId === p.id)
      .map((l: any) => ({ id: l.id, value: l.value })),
    stock: [],
  }));

  // Associer le stock à chaque produit via ses couleurs
  for (const product of products) {
    const colorIds = new Set(product.colors.map((c) => c.id));
    product.stock = stockRes.rows
      .filter((s: any) => colorIds.has(s.colorId))
      .map((s: any) => ({
        colorId: s.colorId,
        lengthOptionId: s.lengthOptionId,
        quantity: s.quantity,
      }));
  }

  return NextResponse.json(products);
}

// POST /api/products — créer un nouveau produit (admin seulement)
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  await ensureSchema();
  const body = await req.json().catch(() => null);
  const { name, categoryId, unitId, pricePerUnit, lengths, colors, startStock } =
    body ?? {};

  if (
    !name?.trim() ||
    !categoryId ||
    !unitId ||
    typeof pricePerUnit !== "number" ||
    pricePerUnit < 0 ||
    !Array.isArray(lengths) ||
    lengths.length === 0 ||
    !Array.isArray(colors) ||
    colors.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Données invalides. Le nom, la catégorie, l'unité, le prix, au moins une longueur et au moins une couleur sont requis.",
      },
      { status: 400 }
    );
  }

  const stockQty = Math.max(0, Number(startStock) || 0);
  const db = getDb();
  const productId = newId("prod_");

  await db.execute({
    sql: `INSERT INTO products (id, name, description, price_per_unit, category_id, unit_id)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [productId, name.trim(), "Produit ajouté manuellement.", pricePerUnit, categoryId, unitId],
  });

  const colorIds: string[] = [];
  for (const c of colors as { name: string; hex: string }[]) {
    const colorId = newId("col_");
    colorIds.push(colorId);
    await db.execute({
      sql: "INSERT INTO colors (id, name, hex, product_id) VALUES (?, ?, ?, ?)",
      args: [colorId, c.name, c.hex, productId],
    });
  }

  const lengthIds: string[] = [];
  for (const value of lengths as number[]) {
    const lengthId = newId("len_");
    lengthIds.push(lengthId);
    await db.execute({
      sql: "INSERT INTO length_options (id, value, product_id) VALUES (?, ?, ?)",
      args: [lengthId, value, productId],
    });
  }

  for (const colorId of colorIds) {
    for (const lengthId of lengthIds) {
      await db.execute({
        sql: `INSERT INTO stock (id, quantity, product_id, color_id, length_option_id)
              VALUES (?, ?, ?, ?, ?)`,
        args: [newId("stk_"), stockQty, productId, colorId, lengthId],
      });
    }
  }

  return NextResponse.json({ success: true, productId });
}
