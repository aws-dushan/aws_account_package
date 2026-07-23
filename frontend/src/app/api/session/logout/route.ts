import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/jwt";

/** Clear the auth cookie. */
export async function POST(req: Request) {
  const response = NextResponse.redirect(new URL("/login", req.url));
  response.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
