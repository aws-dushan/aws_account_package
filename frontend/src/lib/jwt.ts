/** Cookie name holding the .NET API JWT (httpOnly — never read from client JS). */
export const AUTH_COOKIE = "aws_token";

export type JwtClaims = {
  sub?: string;
  nameid?: string;
  username?: string;
  name?: string;
  isAdmin?: string;
  isSuperAdmin?: string;
  mustChangePassword?: string;
  tenantId?: string;
  exp?: number;
};

/** Decode a JWT payload without verifying the signature (the API verifies on every call).
 *  Edge-safe: pure base64url decode, no Node crypto. Returns null if malformed/expired. */
export function decodeJwt(token: string | undefined | null): JwtClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    const claims = JSON.parse(json) as JwtClaims;
    if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  // atob exists in the Edge runtime and modern Node; decode UTF-8 bytes safely.
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const truthy = (v: string | undefined) => v === "true" || v === "True";

/** The .NET token uses ClaimTypes URIs for some claims; normalise to a flat shape. */
export function claimsToUser(c: JwtClaims) {
  const isAdmin = truthy(c.isAdmin);
  const tenantId = c.tenantId ?? null;
  return {
    id: c.sub ?? c.nameid ?? "",
    username: c.username ?? "",
    name: c.name ?? null,
    isAdmin,
    isSuperAdmin: truthy(c.isSuperAdmin) || (isAdmin && !tenantId),
    mustChangePassword: truthy(c.mustChangePassword),
    tenantId,
  };
}
