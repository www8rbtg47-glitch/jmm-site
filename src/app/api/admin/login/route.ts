import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureSchema, getDb } from "@/lib/db";
import { createAdminSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return NextResponse.json(
      { error: "Nom d'utilisateur et mot de passe requis." },
      { status: 400 }
    );
  }

  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT username, password_hash as passwordHash FROM admin_users WHERE username = ?",
    args: [username],
  });

  const adminUser = result.rows[0]
    ? {
        username: result.rows[0].username as string,
        passwordHash: result.rows[0].passwordHash as string,
      }
    : undefined;
  if (!adminUser) {
    return NextResponse.json(
      { error: "Nom d'utilisateur ou mot de passe incorrect." },
      { status: 401 }
    );
  }

  const passwordMatches = await bcrypt.compare(password, adminUser.passwordHash);
  if (!passwordMatches) {
    return NextResponse.json(
      { error: "Nom d'utilisateur ou mot de passe incorrect." },
      { status: 401 }
    );
  }

  await createAdminSession(username);
  return NextResponse.json({ success: true });
}

