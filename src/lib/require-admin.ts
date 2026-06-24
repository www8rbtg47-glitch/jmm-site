import { NextResponse } from "next/server";
import { getAdminSession } from "./auth";

/**
 * Vérifie qu'une requête admin est authentifiée.
 * Retourne null si la session est valide, ou une réponse 401 sinon.
 * Usage: const unauthorized = await requireAdmin(); if (unauthorized) return unauthorized;
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json(
      { error: "Non autorisé. Connecte-toi au panneau admin." },
      { status: 401 }
    );
  }
  return null;
}
