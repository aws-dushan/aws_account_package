import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/jwt";
import { apiBase } from "@/lib/api";

/** Proxy login to the .NET API and store the returned JWT as an httpOnly cookie. */
export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: body.username ?? "", password: body.password ?? "" }),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const data = (await res.json()) as { token: string; user: { mustChangePassword?: boolean } };
  const response = NextResponse.json({ ok: true, mustChangePassword: !!data.user?.mustChangePassword });
  response.cookies.set(AUTH_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h — matches the API token lifetime
  });
  return response;
}
