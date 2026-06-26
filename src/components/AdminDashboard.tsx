"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductDTO, CategoryDTO, UnitDTO } from "@/lib/types";
import { getStockFor, getTotalStock } from "@/lib/stock";

type Props = {
  initialProducts: ProductDTO[];
  initialCategories: CategoryDTO[];
  initialUnits: UnitDTO[];
  adminUsername: string;
};

const SUGGESTED_HEX = [
  "#2B2D2E",
  "#8CC63F",
  "#F2F1ED",
  "#5B4636",
  "#8E3A2A",
  "#4A5A3E",
  "#6E7173",
  "#1F3A52",
];

export default function AdminDashboard({
  initialProducts,
  initialCategories,
  initialUnits,
  adminUsername,
}: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<ProductDTO[]>(initialProducts);
  const [categories, setCategories] = useState<CategoryDTO[]>(initialCategories);
  const [units, setUnits] = useState<UnitDTO[]>(initialUnits);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function refreshFromServer() {
    // Recharge silencieusement les données depuis le serveur sans quitter la page
    router.refresh();
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  // --- Stock ---
  async function adjustStock(
    product: ProductDTO,
    colorId: string,
    lengthOptionId: string,
    delta: number
  ) {
    const current = getStockFor(product.stock, colorId, lengthOptionId);
    const newQty = Math.max(0, current + delta);

    // Mise à jour optimiste locale
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== product.id) return p;
        const exists = p.stock.some(
          (s) => s.colorId === colorId && s.lengthOptionId === lengthOptionId
        );
        return {
          ...p,
          stock: exists
            ? p.stock.map((s) =>
                s.colorId === colorId && s.lengthOptionId === lengthOptionId
                  ? { ...s, quantity: newQty }
                  : s
              )
            : [...p.stock, { colorId, lengthOptionId, quantity: newQty }],
        };
      })
    );

    await fetch("/api/stock/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        colorId,
        lengthOptionId,
        delta,
      }),
    });
  }

  // --- Nom du produit ---
  async function updateProductName(productId: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) {
      showToast("Le nom ne peut pas être vide");
      router.refresh();
      return;
    }
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, name: trimmed } : p))
    );
    const res = await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) showToast(`Nom mis à jour: ${trimmed}`);
  }

  // --- Prix ---
  async function updatePrice(productId: string, newVal: string) {
    const val = parseFloat(newVal);
    if (isNaN(val) || val < 0) return;
    const rounded = Math.round(val * 100) / 100;
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, pricePerUnit: rounded } : p))
    );
    const res = await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePerUnit: rounded }),
    });
    if (res.ok) showToast("Prix mis à jour");
  }

  // --- Catégorie ---
  async function updateCategory(productId: string, categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, categoryId, categoryLabel: cat?.label ?? p.categoryLabel }
          : p
      )
    );
    await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    showToast("Catégorie mise à jour");
  }

  // --- Ajouter une longueur ---
  async function addLength(product: ProductDTO, value: number) {
    if (!value || value <= 0) {
      showToast("Entre une longueur valide");
      return;
    }
    if (product.lengths.some((l) => l.value === value)) {
      showToast("Cette longueur existe déjà pour ce produit");
      return;
    }
    const res = await fetch(`/api/products/${product.id}/lengths`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de l'ajout de la longueur");
      return;
    }
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? {
              ...p,
              lengths: [...p.lengths, { id: data.lengthOptionId, value }],
              stock: [
                ...p.stock,
                ...p.colors.map((c) => ({
                  colorId: c.id,
                  lengthOptionId: data.lengthOptionId,
                  quantity: 0,
                })),
              ],
            }
          : p
      )
    );
    showToast(`Longueur ${value} ajoutée`);
  }

  // --- Retirer une longueur ---
  async function removeLength(product: ProductDTO, lengthOptionId: string) {
    if (product.lengths.length <= 1) {
      showToast("Un produit doit garder au moins une longueur disponible");
      return;
    }
    const res = await fetch(`/api/lengths/${lengthOptionId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de la suppression");
      return;
    }
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? {
              ...p,
              lengths: p.lengths.filter((l) => l.id !== lengthOptionId),
              stock: p.stock.filter((s) => s.lengthOptionId !== lengthOptionId),
            }
          : p
      )
    );
    showToast("Longueur retirée");
  }

  // --- Ajouter une couleur ---
  async function addColor(
    product: ProductDTO,
    name: string,
    hex: string,
    startStock: number
  ) {
    if (!name.trim()) {
      showToast("Donne un nom à la couleur avant de l'ajouter");
      return;
    }
    const res = await fetch(`/api/products/${product.id}/colors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), hex, startStock }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de l'ajout de la couleur");
      return;
    }
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? {
              ...p,
              colors: [...p.colors, { id: data.colorId, name: name.trim(), hex }],
              stock: [
                ...p.stock,
                ...p.lengths.map((l) => ({
                  colorId: data.colorId,
                  lengthOptionId: l.id,
                  quantity: startStock,
                })),
              ],
            }
          : p
      )
    );
    showToast("Couleur ajoutée");
  }

  // --- Retirer une couleur ---
  async function removeColor(product: ProductDTO, colorId: string) {
    if (product.colors.length <= 1) {
      showToast("Un produit doit garder au moins une couleur");
      return;
    }
    const res = await fetch(`/api/colors/${colorId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de la suppression");
      return;
    }
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id
          ? {
              ...p,
              colors: p.colors.filter((c) => c.id !== colorId),
              stock: p.stock.filter((s) => s.colorId !== colorId),
            }
          : p
      )
    );
    showToast("Couleur retirée");
  }

  // --- Supprimer un produit ---
  async function deleteProduct(productId: string) {
    const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      showToast("Produit supprimé");
    }
    setPendingDelete(null);
  }

  // --- Créer une catégorie ---
  async function createCategory(label: string): Promise<string | null> {
    if (!label.trim()) return null;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de la création de la catégorie");
      return null;
    }
    setCategories((prev) => [...prev, { id: data.id, label: data.label }]);
    showToast(`Catégorie "${data.label}" créée`);
    return data.id;
  }

  // --- Créer une unité ---
  async function createUnit(label: string): Promise<string | null> {
    if (!label.trim()) return null;
    const res = await fetch("/api/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de la création de l'unité");
      return null;
    }
    setUnits((prev) => [...prev, { id: data.id, label: data.label }]);
    showToast(`Unité "${data.label}" créée`);
    return data.id;
  }

  // --- Supprimer une catégorie ---
  async function deleteCategory(categoryId: string) {
    const res = await fetch(`/api/categories/${categoryId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de la suppression de la catégorie");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    showToast("Catégorie supprimée");
  }

  // --- Supprimer une unité ---
  async function deleteUnit(unitId: string) {
    const res = await fetch(`/api/units/${unitId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de la suppression de l'unité");
      return;
    }
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    showToast("Unité supprimée");
  }

  // --- Créer un produit ---
  async function createProduct(input: {
    name: string;
    categoryId: string;
    unitId: string;
    pricePerUnit: number;
    lengths: number[];
    colors: { name: string; hex: string }[];
    startStock: number;
  }) {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Erreur lors de la création du produit");
      return;
    }
    showToast(`Produit "${input.name}" créé`);
    router.refresh();
    return data.productId;
  }

  const totalUnits = products.reduce((s, p) => s + getTotalStock(p), 0);
  const lowStockCount = products.filter((p) =>
    p.colors.some((c) =>
      p.lengths.some((l) => {
        const v = getStockFor(p.stock, c.id, l.id);
        return v > 0 && v <= 10;
      })
    )
  ).length;
  const outOfStockCount = products.reduce(
    (s, p) =>
      s +
      p.colors.reduce(
        (s2, c) =>
          s2 + p.lengths.filter((l) => getStockFor(p.stock, c.id, l.id) === 0).length,
        0
      ),
    0
  );

  return (
    <div className="min-h-screen bg-zinc-pale font-sans text-charbon">
      <header className="bg-charbon text-white px-7 py-4 flex items-center justify-between border-b-[3px] border-vert-accent">
        <h2 className="font-display uppercase text-lg">Gestion du stock — JMM</h2>
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc">Connecté: {adminUsername}</span>
          <button
            onClick={handleLogout}
            className="border border-zinc px-3 py-2 text-xs uppercase hover:bg-charbon-clair transition"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-7 pb-24">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-7">
          <Stat num={totalUnits} label="Unités totales" />
          <Stat num={products.length} label="Produits actifs" />
          <Stat num={lowStockCount} label="Produits à stock faible" />
          <Stat num={outOfStockCount} label="Combinaisons épuisées" />
        </div>

        {/* Liste produits */}
        <div className="flex flex-col gap-4 mb-8">
          {products.map((product) => (
            <ProductAdminCard
              key={product.id}
              product={product}
              categories={categories}
              pendingDelete={pendingDelete === product.id}
              onAskDelete={() => setPendingDelete(product.id)}
              onCancelDelete={() => setPendingDelete(null)}
              onConfirmDelete={() => deleteProduct(product.id)}
              onUpdateName={(name) => updateProductName(product.id, name)}
              onUpdatePrice={(val) => updatePrice(product.id, val)}
              onUpdateCategory={(catId) => updateCategory(product.id, catId)}
              onAdjustStock={(colorId, lengthId, delta) =>
                adjustStock(product, colorId, lengthId, delta)
              }
              onAddLength={(value) => addLength(product, value)}
              onRemoveLength={(lengthId) => removeLength(product, lengthId)}
              onAddColor={(name, hex, stock) => addColor(product, name, hex, stock)}
              onRemoveColor={(colorId) => removeColor(product, colorId)}
            />
          ))}
        </div>

        <CategoryAndUnitManager
          categories={categories}
          units={units}
          onDeleteCategory={deleteCategory}
          onDeleteUnit={deleteUnit}
        />

        <NewProductForm
          categories={categories}
          units={units}
          onCreateCategory={createCategory}
          onCreateUnit={createUnit}
          onSubmit={createProduct}
        />
      </div>

      <div
        className={`fixed bottom-5 right-5 bg-charbon text-white px-4 py-3 text-sm z-50 transition-all ${
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        {toast}
      </div>
    </div>
  );
}

function Stat({ num, label }: { num: number; label: string }) {
  return (
    <div className="bg-white border border-black/10 p-4">
      <div className="text-2xl font-bold font-display">{num}</div>
      <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function ProductAdminCard({
  product,
  categories,
  pendingDelete,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onUpdateName,
  onUpdatePrice,
  onUpdateCategory,
  onAdjustStock,
  onAddLength,
  onRemoveLength,
  onAddColor,
  onRemoveColor,
}: {
  product: ProductDTO;
  categories: CategoryDTO[];
  pendingDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onUpdateName: (name: string) => void;
  onUpdatePrice: (val: string) => void;
  onUpdateCategory: (catId: string) => void;
  onAdjustStock: (colorId: string, lengthId: string, delta: number) => void;
  onAddLength: (value: number) => void;
  onRemoveLength: (lengthId: string) => void;
  onAddColor: (name: string, hex: string, startStock: number) => void;
  onRemoveColor: (colorId: string) => void;
}) {
  const [newLenValue, setNewLenValue] = useState("");
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState(
    SUGGESTED_HEX[product.colors.length % SUGGESTED_HEX.length]
  );

  const sortedLengths = useMemo(
    () => [...product.lengths].sort((a, b) => a.value - b.value),
    [product.lengths]
  );

  const unitWord =
    product.unitLabel === "Unité" ? "" : ` ${product.unitLabel.toLowerCase()}`;

  return (
    <div className="bg-white border border-black/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3.5">
        <input
          type="text"
          defaultValue={product.name}
          onBlur={(e) => onUpdateName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="font-bold text-sm min-w-[180px] border border-transparent hover:border-black/10 focus:border-vert-accent focus:bg-zinc-pale px-2 py-1.5 outline-none"
        />

        <select
          value={product.categoryId}
          onChange={(e) => onUpdateCategory(e.target.value)}
          className="text-xs px-2 py-1.5 border border-black/10"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-xs">
          <label className="text-gray-500 uppercase">Prix</label>
          <input
            type="number"
            min={0}
            step={0.01}
            defaultValue={product.pricePerUnit}
            onBlur={(e) => onUpdatePrice(e.target.value)}
            className="w-20 border border-black/10 px-2 py-1.5"
          />
          <span className="text-gray-500">$ / {product.unitLabel}</span>
        </div>

        <div className="ml-auto">
          {!pendingDelete ? (
            <button
              onClick={onAskDelete}
              className="text-xs border border-black/10 px-3 py-1.5 uppercase hover:bg-zinc-pale"
            >
              Supprimer le produit
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-rouge-non">Supprimer pour vrai ?</span>
              <button
                onClick={onConfirmDelete}
                className="bg-rouge-non text-white px-2.5 py-1.5 uppercase"
              >
                Oui, supprimer
              </button>
              <button
                onClick={onCancelDelete}
                className="border border-black/10 px-2.5 py-1.5 uppercase"
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Grille couleur x longueur */}
      <div className="overflow-x-auto -mx-1">
        <table className="border-collapse text-xs min-w-full">
          <thead>
            <tr>
              <th className="text-left p-1.5 border border-black/10 bg-zinc-pale uppercase text-[11px]">
                Couleur
              </th>
              {sortedLengths.map((len) => (
                <th
                  key={len.id}
                  className="p-1.5 border border-black/10 bg-zinc-pale uppercase text-[11px] whitespace-nowrap"
                >
                  {len.value}
                  {unitWord}{" "}
                  <button
                    onClick={() => onRemoveLength(len.id)}
                    aria-label="Retirer cette longueur"
                    className="text-rouge-non px-1"
                  >
                    &times;
                  </button>
                </th>
              ))}
              <th className="p-1.5 border border-black/10 bg-zinc-pale" />
            </tr>
          </thead>
          <tbody>
            {product.colors.map((c) => (
              <tr key={c.id}>
                <td className="p-1.5 border border-black/10 font-bold flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className="w-3.5 h-3.5 inline-block flex-shrink-0"
                    style={{ background: c.hex }}
                  />
                  {c.name}
                </td>
                {sortedLengths.map((len) => {
                  const qty = getStockFor(product.stock, c.id, len.id);
                  return (
                    <td key={len.id} className="p-1.5 border border-black/10 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onAdjustStock(c.id, len.id, -1)}
                          aria-label="Retirer"
                          className="w-5 h-5 border border-black/10 bg-white text-[11px] leading-none"
                        >
                          −
                        </button>
                        <span className={`min-w-[22px] font-bold ${qty === 0 ? "text-gray-300" : ""}`}>
                          {qty}
                        </span>
                        <button
                          onClick={() => onAdjustStock(c.id, len.id, 1)}
                          aria-label="Ajouter"
                          className="w-5 h-5 border border-black/10 bg-white text-[11px] leading-none"
                        >
                          +
                        </button>
                      </div>
                    </td>
                  );
                })}
                <td className="p-1.5 border border-black/10 text-center">
                  <button
                    onClick={() => onRemoveColor(c.id)}
                    className="text-[11px] uppercase text-rouge-non"
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ajouter longueur / couleur */}
      <div className="flex flex-wrap gap-2.5 mt-3.5 pt-3.5 border-t border-black/10">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder={product.unitLabel === "Unité" ? "qté" : "longueur"}
            value={newLenValue}
            onChange={(e) => setNewLenValue(e.target.value)}
            className="w-20 border border-black/10 px-2 py-1.5 text-xs"
          />
          <button
            onClick={() => {
              onAddLength(parseFloat(newLenValue));
              setNewLenValue("");
            }}
            className="bg-charbon text-white px-3 py-1.5 text-xs uppercase"
          >
            Ajouter cette longueur
          </button>
        </div>

        <div className="flex items-center gap-2 border border-dashed border-black/15 bg-zinc-pale px-2.5 py-1.5">
          <input
            type="text"
            placeholder="Nom de la couleur"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            className="w-32 text-xs px-1.5 py-1 border border-black/10"
          />
          <input
            type="color"
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            className="w-8 h-7 p-0 cursor-pointer border border-black/10"
          />
          <button
            onClick={() => {
              onAddColor(newColorName, newColorHex, 0);
              setNewColorName("");
            }}
            className="bg-charbon text-white px-3 py-1.5 text-xs uppercase"
          >
            Ajouter couleur
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryAndUnitManager({
  categories,
  units,
  onDeleteCategory,
  onDeleteUnit,
}: {
  categories: CategoryDTO[];
  units: UnitDTO[];
  onDeleteCategory: (categoryId: string) => void;
  onDeleteUnit: (unitId: string) => void;
}) {
  const [pendingCat, setPendingCat] = useState<string | null>(null);
  const [pendingUnit, setPendingUnit] = useState<string | null>(null);

  return (
    <div className="bg-white border border-black/10 p-5 mb-4">
      <h3 className="font-display uppercase text-sm mb-1">
        Gérer les catégories et unités
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Supprime une catégorie ou une unité créée par erreur. Une catégorie ou unité
        encore utilisée par un produit ne peut pas être supprimée.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-[11px] uppercase text-gray-500 font-bold mb-2">
            Catégories
          </label>
          <div className="flex flex-col gap-1.5">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between bg-zinc-pale border border-black/10 px-3 py-2"
              >
                <span className="text-sm">{c.label}</span>
                {pendingCat === c.id ? (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => {
                        onDeleteCategory(c.id);
                        setPendingCat(null);
                      }}
                      className="bg-rouge-non text-white px-2.5 py-1 uppercase"
                    >
                      Confirmer
                    </button>
                    <button
                      onClick={() => setPendingCat(null)}
                      className="border border-black/10 px-2.5 py-1 uppercase"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setPendingCat(c.id)}
                    className="text-xs uppercase text-rouge-non"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase text-gray-500 font-bold mb-2">
            Unités de mesure
          </label>
          <div className="flex flex-col gap-1.5">
            {units.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between bg-zinc-pale border border-black/10 px-3 py-2"
              >
                <span className="text-sm">{u.label}</span>
                {pendingUnit === u.id ? (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => {
                        onDeleteUnit(u.id);
                        setPendingUnit(null);
                      }}
                      className="bg-rouge-non text-white px-2.5 py-1 uppercase"
                    >
                      Confirmer
                    </button>
                    <button
                      onClick={() => setPendingUnit(null)}
                      className="border border-black/10 px-2.5 py-1 uppercase"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setPendingUnit(u.id)}
                    className="text-xs uppercase text-rouge-non"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewProductForm({
  categories,
  units,
  onCreateCategory,
  onCreateUnit,
  onSubmit,
}: {
  categories: CategoryDTO[];
  units: UnitDTO[];
  onCreateCategory: (label: string) => Promise<string | null>;
  onCreateUnit: (label: string) => Promise<string | null>;
  onSubmit: (input: {
    name: string;
    categoryId: string;
    unitId: string;
    pricePerUnit: number;
    lengths: number[];
    colors: { name: string; hex: string }[];
    startStock: number;
  }) => Promise<string | undefined>;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [lengthsRaw, setLengthsRaw] = useState("");
  const [startStock, setStartStock] = useState("0");
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState(SUGGESTED_HEX[0]);
  const [colors, setColors] = useState<{ name: string; hex: string }[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addColorToList() {
    const trimmed = newColorName.trim();
    if (!trimmed) return;
    setColors((prev) => [...prev, { name: trimmed, hex: newColorHex }]);
    setNewColorName("");
    setNewColorHex(SUGGESTED_HEX[(colors.length + 1) % SUGGESTED_HEX.length]);
  }

  function removeColorFromList(idx: number) {
    setColors((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreateCategory() {
    const id = await onCreateCategory(newCatName);
    if (id) {
      setCategoryId(id);
      setNewCatName("");
    }
  }

  async function handleCreateUnit() {
    const id = await onCreateUnit(newUnitName);
    if (id) {
      setUnitId(id);
      setNewUnitName("");
    }
  }

  async function handleSubmit() {
    const priceNum = parseFloat(price);
    const lengths = [
      ...new Set(
        lengthsRaw
          .split(",")
          .map((s) => parseFloat(s.trim()))
          .filter((n) => !isNaN(n) && n > 0)
      ),
    ].sort((a, b) => a - b);

    if (
      !name.trim() ||
      !categoryId ||
      !unitId ||
      isNaN(priceNum) ||
      priceNum < 0 ||
      lengths.length === 0 ||
      colors.length === 0
    ) {
      setError(
        "Remplis le nom, la catégorie, l'unité, le prix, au moins une longueur et au moins une couleur."
      );
      return;
    }
    setError(null);

    await onSubmit({
      name: name.trim(),
      categoryId,
      unitId,
      pricePerUnit: priceNum,
      lengths,
      colors,
      startStock: Math.max(0, parseInt(startStock) || 0),
    });

    setName("");
    setPrice("");
    setLengthsRaw("");
    setStartStock("0");
    setColors([]);
  }

  return (
    <div className="bg-white border border-black/10 p-5">
      <h3 className="font-display uppercase text-sm mb-4">Ajouter un nouveau produit</h3>

      {error && <p className="text-sm text-rouge-non mb-3">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4">
        <div className="sm:col-span-2">
          <label className="block text-[11px] uppercase text-gray-500 font-bold mb-1.5">
            Nom du produit
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Tôle galvanisée"
            className="w-full border border-black/10 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase text-gray-500 font-bold mb-1.5">
            Catégorie
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full border border-black/10 px-3 py-2 text-sm mb-1.5"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nouvelle catégorie"
              className="flex-1 border border-black/10 px-2 py-1.5 text-xs"
            />
            <button
              onClick={handleCreateCategory}
              className="bg-charbon text-white px-2.5 py-1.5 text-xs uppercase"
            >
              + Créer
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase text-gray-500 font-bold mb-1.5">
            Unité de mesure
          </label>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="w-full border border-black/10 px-3 py-2 text-sm mb-1.5"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              placeholder="Nouvelle unité (ex: mètres)"
              className="flex-1 border border-black/10 px-2 py-1.5 text-xs"
            />
            <button
              onClick={handleCreateUnit}
              className="bg-charbon text-white px-2.5 py-1.5 text-xs uppercase"
            >
              + Créer
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] uppercase text-gray-500 font-bold mb-1.5">
            Prix par unité ($)
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Ex: 6.25"
            className="w-full border border-black/10 px-3 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] uppercase text-gray-500 font-bold mb-1.5">
            Longueurs ou tailles offertes (séparées par des virgules)
          </label>
          <input
            type="text"
            value={lengthsRaw}
            onChange={(e) => setLengthsRaw(e.target.value)}
            placeholder="Ex: 8, 10, 12, 16"
            className="w-full border border-black/10 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase text-gray-500 font-bold mb-1.5">
            Stock de départ (par couleur et par longueur)
          </label>
          <input
            type="number"
            min={0}
            value={startStock}
            onChange={(e) => setStartStock(e.target.value)}
            className="w-full border border-black/10 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <label className="block text-[11px] uppercase text-gray-500 font-bold mb-2">
        Couleurs offertes pour ce produit — ajoute-en autant que tu veux
      </label>
      <div className="flex flex-wrap gap-2 mb-4">
        {colors.map((c, idx) => (
          <span
            key={idx}
            className="flex items-center gap-1.5 bg-zinc-pale border border-black/10 px-2.5 py-1.5 text-xs"
          >
            <span className="w-3.5 h-3.5 inline-block" style={{ background: c.hex }} />
            {c.name}
            <button
              onClick={() => removeColorFromList(idx)}
              className="text-rouge-non ml-1"
            >
              &times;
            </button>
          </span>
        ))}
        <span className="flex items-center gap-1.5 border border-dashed border-black/15 px-2.5 py-1.5">
          <input
            type="text"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            placeholder="Nom couleur"
            className="w-24 text-xs px-1.5 py-1 border border-black/10"
          />
          <input
            type="color"
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            className="w-7 h-6 p-0 cursor-pointer border border-black/10"
          />
          <button
            onClick={addColorToList}
            className="bg-charbon text-white px-2.5 py-1 text-[11px] uppercase"
          >
            Ajouter
          </button>
        </span>
      </div>

      <button
        onClick={handleSubmit}
        className="bg-vert-accent text-charbon px-5 py-2.5 text-sm uppercase tracking-wide font-bold"
      >
        Créer le produit
      </button>
    </div>
  );
}
