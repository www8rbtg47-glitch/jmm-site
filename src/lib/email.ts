import { Resend } from "resend";
import type { CartItemDTO } from "./types";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (resendClient) return resendClient;
  resendClient = new Resend(key);
  return resendClient;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ADMIN_NOTIFICATION_EMAIL);
}

function formatMoney(v: number): string {
  return v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function itemsToHtmlList(items: { productName: string; colorName: string; length: number; quantity: number; pricePerUnit: number }[]): string {
  return items
    .map(
      (item) =>
        `<li>${item.productName} — ${item.colorName}, ${item.length} — qté ${item.quantity} — ${formatMoney(item.pricePerUnit * item.length * item.quantity)}</li>`
    )
    .join("");
}

/**
 * Avertit l'administrateur par courriel qu'une nouvelle commande attend une confirmation.
 * Ne fait rien (silencieusement) si RESEND_API_KEY ou ADMIN_NOTIFICATION_EMAIL
 * ne sont pas configurés — le site doit continuer à fonctionner sans courriels
 * tant que ce n'est pas mis en place.
 *
 * IMPORTANT: le SDK Resend ne lance jamais d'exception JavaScript même en cas
 * d'échec — il retourne toujours { data, error }. On doit donc vérifier ce
 * champ explicitement et lancer nous-mêmes une erreur, sinon un échec réel
 * (domaine non vérifié, clé invalide, etc.) passerait totalement inaperçu.
 */
export async function sendAdminNewOrderEmail(params: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  total: number;
  items: CartItemDTO[];
}) {
  const resend = getResend();
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!resend || !adminEmail) return;

  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "JMM <onboarding@resend.dev>";

  const result = await resend.emails.send({
    from: fromAddress,
    to: adminEmail,
    subject: `Nouvelle commande à confirmer — ${params.customerName}`,
    html: `
      <h2>Nouvelle commande reçue</h2>
      <p><strong>Client:</strong> ${params.customerName}</p>
      <p><strong>Courriel:</strong> ${params.customerEmail}</p>
      <p><strong>Téléphone:</strong> ${params.customerPhone}</p>
      <p><strong>Total:</strong> ${formatMoney(params.total)}</p>
      <h3>Articles commandés</h3>
      <ul>${itemsToHtmlList(params.items)}</ul>
      <p>Connecte-toi au panneau admin pour ajuster et confirmer cette commande.</p>
    `,
  });

  if (result.error) {
    throw new Error(
      `Resend a refusé l'envoi du courriel admin: ${result.error.message} (${result.error.name})`
    );
  }
}

/**
 * Envoie un courriel de confirmation (ou de refus) au client, avec un message
 * personnalisé écrit par l'administrateur.
 */
export async function sendCustomerOrderEmail(params: {
  customerEmail: string;
  customerName: string;
  subject: string;
  message: string;
}) {
  const resend = getResend();
  if (!resend) return { sent: false, reason: "Resend non configuré." };

  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "JMM <onboarding@resend.dev>";

  const result = await resend.emails.send({
    from: fromAddress,
    to: params.customerEmail,
    subject: params.subject,
    html: params.message.replace(/\n/g, "<br>"),
  });

  if (result.error) {
    throw new Error(
      `Resend a refusé l'envoi du courriel au client: ${result.error.message} (${result.error.name})`
    );
  }

  return { sent: true };
}
