import { ProductDTO, StockEntryDTO } from "./types";

/** Trouve la quantité en stock pour une combinaison couleur + longueur précise. */
export function getStockFor(
  stock: StockEntryDTO[],
  colorId: string,
  lengthOptionId: string
): number {
  const entry = stock.find(
    (s) => s.colorId === colorId && s.lengthOptionId === lengthOptionId
  );
  return entry ? entry.quantity : 0;
}

/** Stock total d'un produit, toutes combinaisons confondues. */
export function getTotalStock(product: ProductDTO): number {
  return product.stock.reduce((sum, s) => sum + s.quantity, 0);
}

/** Niveau de stock pour l'affichage des badges. */
export type StockLevel = "ok" | "low" | "out";

export function getStockLevel(quantity: number): StockLevel {
  if (quantity <= 0) return "out";
  if (quantity <= 10) return "low";
  return "ok";
}

/** Vérifie qu'une longueur a au moins une couleur en stock. */
export function lengthHasAnyStock(
  product: ProductDTO,
  lengthOptionId: string
): boolean {
  return product.colors.some(
    (c) => getStockFor(product.stock, c.id, lengthOptionId) > 0
  );
}

/** Vérifie qu'une couleur a au moins une longueur en stock. */
export function colorHasAnyStock(
  product: ProductDTO,
  colorId: string
): boolean {
  return product.lengths.some(
    (l) => getStockFor(product.stock, colorId, l.id) > 0
  );
}

/** Calcule le prix total d'une ligne de commande. */
export function calculateLineTotal(
  pricePerUnit: number,
  length: number,
  quantity: number
): number {
  return Math.round(pricePerUnit * length * quantity * 100) / 100;
}

/** Formatte un nombre en dollars canadiens. */
export function formatMoney(value: number): string {
  return value.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}
