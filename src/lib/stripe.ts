import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/**
 * Retourne le client Stripe si STRIPE_SECRET_KEY est configuré, sinon null.
 * Permet au site de fonctionner uniquement avec "paiement à la livraison"
 * tant que le marchand n'a pas encore connecté son compte Stripe.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (stripeClient) return stripeClient;
  stripeClient = new Stripe(key);
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
