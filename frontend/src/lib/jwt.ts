// src/lib/jwt.ts

export interface DecodedToken {
  exp: number;  // expiration timestamp (seconds)
  iat: number;
  user_id: string;
}

export function decodeJWT(token: string): DecodedToken | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function isTokenValid(token: string): boolean {
  const decoded = decodeJWT(token);
  if (!decoded) return false;
  const now = Math.floor(Date.now() / 1000);
  return decoded.exp > now;
}