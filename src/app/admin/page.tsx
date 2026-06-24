import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { ensureSchema, getDb } from "@/lib/db";
import type { ProductDTO, CategoryDTO, UnitDTO } from "@/lib/types";
import AdminDashboard from "@/components/AdminDashboard";

async function loadAdminData(): Promise<{
  products: ProductDTO[];
  categories: CategoryDTO[];
  units: UnitDTO[];
}> {
  await ensureSchema();
  const db = getDb();

  const [productsRes, colorsRes, lengthsRes, stockRes, categoriesRes, unitsRes] =
    await Promise.all([
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
      db.execute(
        "SELECT color_id as colorId, length_option_id as lengthOptionId, quantity FROM stock"
      ),
      db.execute("SELECT id, label FROM categories ORDER BY label ASC"),
      db.execute("SELECT id, label FROM units ORDER BY label ASC"),
    ]);

  const products: ProductDTO[] = productsRes.rows.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    description: p.description as string,
    pricePerUnit: p.pricePerUnit as number,
    categoryId: p.categoryId as string,
    categoryLabel: p.categoryLabel as string,
    unitId: p.unitId as string,
    unitLabel: p.unitLabel as string,
    colors: colorsRes.rows
      .filter((c) => c.productId === p.id)
      .map((c) => ({ id: c.id as string, name: c.name as string, hex: c.hex as string })),
    lengths: lengthsRes.rows
      .filter((l) => l.productId === p.id)
      .map((l) => ({ id: l.id as string, value: l.value as number })),
    stock: [],
  }));

  for (const product of products) {
    const colorIds = new Set(product.colors.map((c) => c.id));
    product.stock = stockRes.rows
      .filter((s) => colorIds.has(s.colorId as string))
      .map((s) => ({
        colorId: s.colorId as string,
        lengthOptionId: s.lengthOptionId as string,
        quantity: s.quantity as number,
      }));
  }

  const categories: CategoryDTO[] = categoriesRes.rows.map((c) => ({
    id: c.id as string,
    label: c.label as string,
  }));
  const units: UnitDTO[] = unitsRes.rows.map((u) => ({
    id: u.id as string,
    label: u.label as string,
  }));

  return { products, categories, units };
}

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const { products, categories, units } = await loadAdminData();

  return (
    <AdminDashboard
      initialProducts={products}
      initialCategories={categories}
      initialUnits={units}
      adminUsername={session.username}
    />
  );
}
