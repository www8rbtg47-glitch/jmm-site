"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderDTO } from "@/lib/types";

const STATUS_LABEL: Record<OrderDTO["status"], string> = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  refusee: "Refusée",
};

const STATUS_CLASS: Record<OrderDTO["status"], string> = {
  en_attente: "bg-[#FBF0DA] text-jaune-bas",
  confirmee: "bg-[#E7F0E6] text-vert-ok",
  refusee: "bg-[#F6E3DF] text-rouge-non",
};

function formatMoney(v: number): string {
  return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + "Z").toLocaleString("fr-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function OrdersDashboard({ adminUsername }: { adminUsername: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"toutes" | OrderDTO["status"]>("en_attente");
  const [toast, setToast] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function loadOrders() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  const visibleOrders = orders.filter((o) => filter === "toutes" || o.status === filter);
  const pendingCount = orders.filter((o) => o.status === "en_attente").length;

  return (
    <div className="min-h-screen bg-zinc-pale font-sans text-charbon">
      <header className="bg-charbon text-white px-7 py-4 flex items-center justify-between border-b-[3px] border-vert-accent">
        <div className="flex items-center gap-4">
          <h2 className="font-display uppercase text-lg">Commandes — JMM</h2>
          <a href="/admin" className="text-xs text-zinc underline hover:text-white">
            Retour à la gestion du stock
          </a>
        </div>
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
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-2">
            {(["en_attente", "confirmee", "refusee", "toutes"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-2 text-xs uppercase tracking-wide border ${
                  filter === s ? "bg-charbon text-white border-charbon" : "bg-white border-black/10"
                }`}
              >
                {s === "toutes" ? "Toutes" : STATUS_LABEL[s]}
                {s === "en_attente" && pendingCount > 0 ? ` (${pendingCount})` : ""}
              </button>
            ))}
          </div>
          <button
            onClick={loadOrders}
            className="text-xs uppercase text-gray-500 underline"
          >
            Rafraîchir
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Chargement...</p>
        ) : visibleOrders.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune commande dans cette catégorie.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isOpen={openOrderId === order.id}
                onToggle={() => setOpenOrderId(openOrderId === order.id ? null : order.id)}
                onChanged={loadOrders}
                showToast={showToast}
              />
            ))}
          </div>
        )}
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

function OrderCard({
  order,
  isOpen,
  onToggle,
  onChanged,
  showToast,
}: {
  order: OrderDTO;
  isOpen: boolean;
  onToggle: () => void;
  onChanged: () => void;
  showToast: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<{ subject: string; body: string } | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);

  async function adjustQty(itemId: string, quantity: number) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${order.id}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    onChanged();
  }

  async function removeItem(itemId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${order.id}/items/${itemId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    onChanged();
  }

  function buildConfirmationDraft() {
    const lines = order.items
      .map((i) => `- ${i.productName} (${i.colorName}, ${i.length}) x${i.quantity} — ${formatMoney(i.pricePerUnit * i.length * i.quantity)}`)
      .join("\n");
    setMessageDraft({
      subject: `Confirmation de ta commande — JMM`,
      body: `Bonjour ${order.customerName},\n\nTa commande est confirmée:\n\n${lines}\n\nTotal: ${formatMoney(order.total)}\n\nMerci de ta confiance!\nJMM`,
    });
  }

  function buildRefusalDraft() {
    setMessageDraft({
      subject: `À propos de ta commande — JMM`,
      body: `Bonjour ${order.customerName},\n\nMalheureusement, nous ne sommes pas en mesure de compléter ta commande pour le moment.\n\nN'hésite pas à nous contacter pour plus de détails.\n\nJMM`,
    });
  }

  async function confirmOrder() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${order.id}/confirm`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    showToast("Commande confirmée — stock déduit");
    buildConfirmationDraft();
    onChanged();
  }

  async function refuseOrder() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${order.id}/refuse`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    showToast("Commande refusée");
    buildRefusalDraft();
    onChanged();
  }

  async function sendMessage() {
    if (!messageDraft) return;
    setSendingMessage(true);
    const res = await fetch(`/api/admin/orders/${order.id}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: messageDraft.subject, message: messageDraft.body }),
    });
    const data = await res.json();
    setSendingMessage(false);
    if (!res.ok) {
      showToast(data.error || "Erreur lors de l'envoi");
      return;
    }
    showToast(`Message envoyé à ${order.customerEmail}`);
    setMessageDraft(null);
  }

  return (
    <div className="bg-white border border-black/10">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`text-[11px] px-2.5 py-1 uppercase tracking-wide ${STATUS_CLASS[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
          <span className="font-bold text-sm">{order.customerName}</span>
          <span className="text-xs text-gray-500">{formatDate(order.createdAt)}</span>
        </div>
        <span className="font-bold">{formatMoney(order.total)}</span>
      </button>

      {isOpen && (
        <div className="border-t border-black/10 p-4 flex flex-col gap-4">
          <div className="text-sm grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div><span className="text-gray-500">Courriel:</span> {order.customerEmail}</div>
            <div><span className="text-gray-500">Téléphone:</span> {order.customerPhone}</div>
            <div><span className="text-gray-500">Paiement:</span> {order.paymentMethod === "livraison" ? "À la livraison" : "En ligne"}</div>
          </div>

          <div className="flex flex-col gap-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-zinc-pale border border-black/10 px-3 py-2 text-sm">
                <span>
                  {item.productName} — {item.colorName}, {item.length}
                </span>
                <div className="flex items-center gap-3">
                  {order.status === "en_attente" ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={busy}
                          onClick={() => adjustQty(item.id, Math.max(1, item.quantity - 1))}
                          className="w-6 h-6 border border-black/10 bg-white text-xs"
                        >
                          −
                        </button>
                        <span className="min-w-[20px] text-center font-bold">{item.quantity}</span>
                        <button
                          disabled={busy}
                          onClick={() => adjustQty(item.id, item.quantity + 1)}
                          className="w-6 h-6 border border-black/10 bg-white text-xs"
                        >
                          +
                        </button>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() => removeItem(item.id)}
                        className="text-[11px] uppercase text-rouge-non"
                      >
                        Retirer
                      </button>
                    </>
                  ) : (
                    <span className="font-bold">qté {item.quantity}</span>
                  )}
                  <span className="font-bold min-w-[80px] text-right">
                    {formatMoney(item.pricePerUnit * item.length * item.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-rouge-non">{error}</p>}

          {order.status === "en_attente" && (
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={confirmOrder}
                className="bg-vert-accent text-charbon px-4 py-2.5 text-sm uppercase tracking-wide font-bold"
              >
                Confirmer la commande
              </button>
              <button
                disabled={busy}
                onClick={refuseOrder}
                className="border border-rouge-non text-rouge-non px-4 py-2.5 text-sm uppercase tracking-wide"
              >
                Refuser la commande
              </button>
            </div>
          )}

          {order.status !== "en_attente" && !messageDraft && (
            <button
              onClick={order.status === "confirmee" ? buildConfirmationDraft : buildRefusalDraft}
              className="self-start text-xs uppercase underline text-gray-500"
            >
              Préparer un message pour le client
            </button>
          )}

          {messageDraft && (
            <div className="bg-zinc-pale border border-black/10 p-3 flex flex-col gap-2">
              <label className="text-[11px] uppercase text-gray-500 font-bold">Sujet</label>
              <input
                type="text"
                value={messageDraft.subject}
                onChange={(e) => setMessageDraft({ ...messageDraft, subject: e.target.value })}
                className="border border-black/10 px-2 py-1.5 text-sm"
              />
              <label className="text-[11px] uppercase text-gray-500 font-bold">Message</label>
              <textarea
                value={messageDraft.body}
                onChange={(e) => setMessageDraft({ ...messageDraft, body: e.target.value })}
                rows={8}
                className="border border-black/10 px-2 py-1.5 text-sm font-sans"
              />
              <div className="flex gap-2">
                <button
                  disabled={sendingMessage}
                  onClick={sendMessage}
                  className="bg-charbon text-white px-4 py-2 text-xs uppercase"
                >
                  {sendingMessage ? "Envoi..." : "Envoyer par courriel"}
                </button>
                <button
                  onClick={() => setMessageDraft(null)}
                  className="border border-black/10 px-4 py-2 text-xs uppercase"
                >
                  Fermer sans envoyer
                </button>
              </div>
              <p className="text-[11px] text-gray-500">
                Si l&apos;envoi automatique n&apos;est pas configuré, copie ce texte et envoie-le toi-même par courriel ou texto.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
