"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ProductDTO, CategoryDTO, CartItemDTO } from "@/lib/types";
import {
  getStockFor,
  getTotalStock,
  getStockLevel,
  lengthHasAnyStock,
  calculateLineTotal,
  formatMoney,
} from "@/lib/stock";

type Props = {
  initialProducts: ProductDTO[];
  initialCategories: CategoryDTO[];
};

export default function Catalog({ initialProducts, initialCategories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products] = useState<ProductDTO[]>(initialProducts);
  const [activeCat, setActiveCat] = useState<string>("tous");
  const [cart, setCart] = useState<CartItemDTO[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<ProductDTO | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  // Affiche un message après un retour de paiement Stripe (succès ou annulation)
  useEffect(() => {
    const result = searchParams.get("commande");
    if (result === "succes") {
      setCart([]);
      showToast("Paiement reçu — commande confirmée. Merci!");
      router.replace("/");
    } else if (result === "annulee") {
      showToast("Paiement annulé — ton panier est toujours là.");
      router.replace("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleProducts = useMemo(
    () =>
      activeCat === "tous"
        ? products
        : products.filter((p) => p.categoryId === activeCat),
    [products, activeCat]
  );

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce(
    (s, i) => s + calculateLineTotal(i.pricePerUnit, i.length, i.quantity),
    0
  );

  function addToCart(item: CartItemDTO) {
    setCart((prev) => [...prev, item]);
    setModalProduct(null);
    showToast("Ajouté au panier");
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  async function checkoutOnline() {
    if (cart.length === 0) return;
    setCheckingOut(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOrderError(data.error || "Erreur lors de la commande.");
        return;
      }
      // Redirige vers la page de paiement sécurisée de Stripe
      window.location.href = data.url;
    } catch {
      setOrderError("Impossible de joindre le serveur. Réessaie.");
      setCheckingOut(false);
    }
  }

  async function checkoutDelivery() {
    if (cart.length === 0) return;
    if (!customerName.trim() || !customerEmail.trim() || !customerPhone.trim()) {
      setOrderError("Ton nom, ton courriel et ton téléphone sont requis pour passer la commande.");
      return;
    }
    setCheckingOut(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart,
          paymentMethod: "livraison",
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOrderError(data.error || "Erreur lors de la commande.");
        return;
      }
      setCart([]);
      setCartOpen(false);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      showToast("Commande envoyée — en attente de confirmation");
    } catch {
      setOrderError("Impossible de joindre le serveur. Réessaie.");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-pale text-charbon font-sans">
      {/* En-tête */}
      <header className="sticky top-0 z-40 bg-charbon text-zinc-pale border-b-[3px] border-vert-accent">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-vert-accent flex items-center justify-center font-display font-bold text-charbon -skew-x-6">
              JM
            </div>
            <div>
              <h1 className="font-display text-lg uppercase tracking-wide">JMM</h1>
              <p className="text-[11px] text-zinc uppercase tracking-widest opacity-80">
                Tôle &amp; revêtement métallique
              </p>
            </div>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative border border-zinc text-zinc-pale px-3 py-2 text-sm hover:bg-charbon-clair transition"
          >
            Panier
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-vert-accent text-charbon text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 pb-20">
        {/* Hero */}
        <section className="bg-charbon text-zinc-pale p-8 md:p-10 mb-8 flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl uppercase leading-tight max-w-md">
              Matériaux de ferblanterie, prêts pour votre chantier
            </h2>
            <p className="text-sm text-zinc mt-2 max-w-md">
              Tôle en feuilles, gouttières et accessoires. Choisissez la longueur et la
              couleur, on vous dit tout de suite si c&apos;est en stock.
            </p>
          </div>
          <div className="hidden md:flex gap-1 h-16">
            <div className="w-2.5 bg-vert-accent" />
            <div className="w-2.5 bg-zinc self-end h-[70%]" />
            <div className="w-2.5 bg-vert-clair self-end h-[85%]" />
            <div className="w-2.5 bg-zinc self-end h-1/2" />
          </div>
        </section>

        {/* Filtres catégorie */}
        <div className="flex gap-2 flex-wrap mb-6">
          <button
            onClick={() => setActiveCat("tous")}
            className={`px-4 py-2 text-sm uppercase tracking-wide border ${
              activeCat === "tous"
                ? "bg-charbon text-white border-charbon"
                : "bg-white border-black/10"
            }`}
          >
            Tous les produits
          </button>
          {initialCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`px-4 py-2 text-sm uppercase tracking-wide border ${
                activeCat === c.id
                  ? "bg-charbon text-white border-charbon"
                  : "bg-white border-black/10"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Grille produits */}
        {visibleProducts.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-16">
            Aucun produit dans cette catégorie pour le moment.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleProducts.map((p) => {
              const total = getTotalStock(p);
              const level = getStockLevel(total);
              return (
                <div key={p.id} className="bg-white border border-black/10 flex flex-col">
                  <div className="h-24 bg-zinc flex items-center justify-center border-b border-black/10">
                    <span className="text-[11px] text-gray-500 uppercase tracking-wide">
                      {p.categoryLabel}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <h3 className="font-display text-base uppercase">{p.name}</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">{p.description}</p>
                    <StockBadge level={level} />
                    <button
                      disabled={total <= 0}
                      onClick={() => setModalProduct(p)}
                      className={`mt-auto py-2.5 text-sm uppercase tracking-wide ${
                        total <= 0
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : "bg-charbon text-white hover:bg-vert-accent hover:text-charbon transition"
                      }`}
                    >
                      {total <= 0 ? "Indisponible" : "Configurer ma commande"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal produit */}
      {modalProduct && (
        <ProductModal
          product={modalProduct}
          onClose={() => setModalProduct(null)}
          onAdd={addToCart}
        />
      )}

      {/* Overlay commun */}
      {(cartOpen || modalProduct) && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => {
            setCartOpen(false);
            setModalProduct(null);
          }}
        />
      )}

      {/* Panneau panier */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[380px] bg-white shadow-xl z-40 flex flex-col transition-transform ${
          cartOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="bg-charbon text-white px-5 py-4 flex items-center justify-between">
          <h3 className="font-display uppercase text-base">Votre commande</h3>
          <button onClick={() => setCartOpen(false)} className="text-xl leading-none">
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-10">
              Votre panier est vide
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} className="border border-black/10 p-3 flex gap-3">
                <div
                  className="w-8 h-8 flex-shrink-0"
                  style={{ background: item.colorHex }}
                />
                <div className="flex-1">
                  <div className="text-sm font-bold">{item.productName}</div>
                  <div className="text-xs text-gray-500 my-0.5">
                    {item.colorName} · {item.length} · qté {item.quantity}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm">
                      {formatMoney(
                        calculateLineTotal(item.pricePerUnit, item.length, item.quantity)
                      )}
                    </span>
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="text-[11px] uppercase text-rouge-non"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-black/10 px-5 py-4">
          <div className="flex justify-between text-base font-bold mb-3">
            <span>Total</span>
            <span>{formatMoney(cartTotal)}</span>
          </div>

          <div className="flex flex-col gap-2 mb-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">
              Tes coordonnées (requises pour le paiement à la livraison)
            </p>
            <input
              type="text"
              placeholder="Nom complet"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full border border-black/15 px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="Courriel"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full border border-black/15 px-3 py-2 text-sm"
            />
            <input
              type="tel"
              placeholder="Téléphone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full border border-black/15 px-3 py-2 text-sm"
            />
          </div>

          {orderError && (
            <p className="text-xs text-rouge-non mb-2">{orderError}</p>
          )}
          <div className="flex flex-col gap-2">
            <button
              disabled={cart.length === 0 || checkingOut}
              onClick={checkoutOnline}
              className="w-full bg-charbon text-white py-3 text-sm uppercase tracking-wide disabled:bg-gray-300 disabled:text-gray-500 hover:bg-vert-accent hover:text-charbon transition"
            >
              {checkingOut ? "Redirection..." : "Payer en ligne"}
            </button>
            <button
              disabled={cart.length === 0 || checkingOut}
              onClick={checkoutDelivery}
              className="w-full border border-charbon py-3 text-sm uppercase tracking-wide disabled:border-gray-300 disabled:text-gray-400 hover:bg-zinc-pale transition"
            >
              {checkingOut ? "Envoi..." : "Payer à la livraison"}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
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

function StockBadge({ level }: { level: "ok" | "low" | "out" }) {
  const config = {
    ok: { label: "En stock", className: "bg-[#E7F0E6] text-vert-ok" },
    low: { label: "Stock faible", className: "bg-[#FBF0DA] text-jaune-bas" },
    out: { label: "Épuisé", className: "bg-[#F6E3DF] text-rouge-non" },
  }[level];
  return (
    <span
      className={`text-[11px] px-2.5 py-1 uppercase tracking-wide self-start ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function ProductModal({
  product,
  onClose,
  onAdd,
}: {
  product: ProductDTO;
  onClose: () => void;
  onAdd: (item: CartItemDTO) => void;
}) {
  const sortedLengths = useMemo(
    () => [...product.lengths].sort((a, b) => a.value - b.value),
    [product.lengths]
  );
  const [lengthOptionId, setLengthOptionId] = useState(
    sortedLengths.find((l) => lengthHasAnyStock(product, l.id))?.id ??
      sortedLengths[0]?.id
  );
  const [colorId, setColorId] = useState(() => {
    const c = product.colors.find(
      (c) => getStockFor(product.stock, c.id, lengthOptionId) > 0
    );
    return (c ?? product.colors[0])?.id;
  });
  const [qty, setQty] = useState(1);

  const selectedLength = sortedLengths.find((l) => l.id === lengthOptionId);
  const stockForCombo = getStockFor(product.stock, colorId, lengthOptionId);
  const level = getStockLevel(stockForCombo);
  const lineTotal = selectedLength
    ? calculateLineTotal(product.pricePerUnit, selectedLength.value, qty)
    : 0;

  function handleSelectLength(newLenId: string) {
    setLengthOptionId(newLenId);
    // Si la couleur actuelle n'a pas de stock pour cette longueur, basculer
    const stillOk = getStockFor(product.stock, colorId, newLenId) > 0;
    if (!stillOk) {
      const fallback = product.colors.find(
        (c) => getStockFor(product.stock, c.id, newLenId) > 0
      );
      if (fallback) setColorId(fallback.id);
    }
    setQty(1);
  }

  const unitWord = product.unitLabel === "Unité" ? "unités" : product.unitLabel.toLowerCase();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto border-t-4 border-vert-accent">
        <div className="px-5 py-4 border-b border-black/10 flex items-center justify-between">
          <h3 className="font-display uppercase text-base">{product.name}</h3>
          <button onClick={onClose} className="text-xl text-gray-400 leading-none">
            &times;
          </button>
        </div>
        <div className="p-5 flex flex-col gap-5">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-2">
              {product.unitLabel === "Unité" ? "Quantité par unité" : "Longueur par section"}
            </label>
            <div className="flex gap-2 flex-wrap">
              {sortedLengths.map((l) => {
                const hasStock = lengthHasAnyStock(product, l.id);
                return (
                  <button
                    key={l.id}
                    disabled={!hasStock}
                    onClick={() => handleSelectLength(l.id)}
                    className={`px-3 py-2 text-sm border ${
                      lengthOptionId === l.id
                        ? "bg-charbon text-white border-charbon"
                        : "bg-white border-black/10"
                    } ${!hasStock ? "opacity-40 cursor-not-allowed line-through" : ""}`}
                  >
                    {l.value} {unitWord}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-2">
              Couleur
            </label>
            <div className="flex gap-3 flex-wrap">
              {product.colors.map((c) => {
                const stock = getStockFor(product.stock, c.id, lengthOptionId);
                const disabled = stock <= 0;
                return (
                  <div key={c.id} className="text-center">
                    <button
                      disabled={disabled}
                      onClick={() => setColorId(c.id)}
                      style={{ background: c.hex }}
                      className={`w-12 h-12 relative border-2 ${
                        colorId === c.id ? "border-charbon" : "border-transparent"
                      } ${disabled ? "opacity-25 cursor-not-allowed" : ""}`}
                    >
                      {colorId === c.id && (
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-charbon text-white text-[10px] flex items-center justify-center">
                          ✓
                        </span>
                      )}
                    </button>
                    <div className="text-[11px] text-gray-600 mt-1 max-w-[60px]">
                      {c.name}
                      {disabled ? " (épuisé)" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-2">
              Quantité de sections
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-8 h-8 border border-black/10 bg-white text-base"
              >
                −
              </button>
              <span className="text-base font-bold min-w-[28px] text-center">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="w-8 h-8 border border-black/10 bg-white text-base"
              >
                +
              </button>
            </div>
          </div>

          <StockNote level={level} stockForCombo={stockForCombo} unitWord={unitWord} />

          <div className="bg-zinc-pale px-4 py-3 flex justify-between items-baseline">
            <span className="text-xs uppercase text-gray-500">Total estimé</span>
            <span className="text-xl font-bold">{formatMoney(lineTotal)}</span>
          </div>

          <button
            disabled={stockForCombo <= 0 || !selectedLength}
            onClick={() =>
              selectedLength &&
              onAdd({
                productId: product.id,
                productName: product.name,
                colorId,
                colorName: product.colors.find((c) => c.id === colorId)?.name ?? "",
                colorHex: product.colors.find((c) => c.id === colorId)?.hex ?? "",
                lengthOptionId,
                length: selectedLength.value,
                quantity: qty,
                pricePerUnit: product.pricePerUnit,
              })
            }
            className="bg-vert-accent text-charbon py-3.5 text-sm uppercase tracking-wide font-bold disabled:bg-gray-300 disabled:text-gray-500"
          >
            {stockForCombo <= 0 ? "Indisponible dans cette combinaison" : "Ajouter au panier"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StockNote({
  level,
  stockForCombo,
  unitWord,
}: {
  level: "ok" | "low" | "out";
  stockForCombo: number;
  unitWord: string;
}) {
  const config = {
    ok: {
      text: `En stock — ${stockForCombo} ${unitWord} disponibles dans cette combinaison`,
      className: "text-vert-ok",
    },
    low: {
      text: `Stock faible — seulement ${stockForCombo} ${unitWord} restants`,
      className: "text-jaune-bas",
    },
    out: {
      text: "Épuisé dans cette combinaison pour l'instant",
      className: "text-rouge-non",
    },
  }[level];
  return <p className={`text-sm ${config.className}`}>{config.text}</p>;
}
