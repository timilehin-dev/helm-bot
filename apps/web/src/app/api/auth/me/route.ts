import { NextRequest, NextResponse } from "next/server";
import { authRequired, LOCAL_OPERATOR_ID, readUser } from "@/lib/auth";

/**
 * `GET /api/auth/me` — current session (or local-mode fallback).
 *
 * Returns `required` so the client can decide whether to block the app behind a
 * sign-in gate, plus the resolved user id it should namespace reads/writes under.
 */
export async function GET(req: NextRequest) {
  const required = authRequired();
  const user = readUser(req);
  return NextResponse.json({
    ok: true,
    required,
    user: user
      ? { id: user.id, login: user.login, name: user.name }
      : null,
    userId: (user ? user.id : null) ?? (required ? null : LOCAL_OPERATOR_ID),
  });
}