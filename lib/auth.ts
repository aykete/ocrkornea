import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'fallback-secret-key'
);
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const COOKIE_NAME = 'auth-token';
const TOKEN_EXPIRY = '7d'; // 7 gün

export interface AuthToken {
  authenticated: boolean;
  createdAt: number;
}

/**
 * Şifreyi kontrol et
 */
export function verifyPassword(password: string): boolean {
  return password === AUTH_PASSWORD;
}

/**
 * JWT token oluştur (Edge Runtime compatible)
 */
export async function createToken(): Promise<string> {
  const payload: AuthToken = {
    authenticated: true,
    createdAt: Date.now(),
  };

  const token = await new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(AUTH_SECRET);

  return token;
}

/**
 * JWT token'ı doğrula (Edge Runtime compatible)
 */
export async function verifyToken(token: string): Promise<AuthToken | null> {
  try {
    const { payload } = await jwtVerify(token, AUTH_SECRET);
    return payload as unknown as AuthToken;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Cookie'den token al ve doğrula
 */
export async function getAuthToken(): Promise<AuthToken | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME);

  if (!token) {
    return null;
  }

  return await verifyToken(token.value);
}

/**
 * Kullanıcı authenticate olmuş mu kontrol et
 */
export async function isAuthenticated(): Promise<boolean> {
  const authToken = await getAuthToken();
  return authToken !== null && authToken.authenticated === true;
}

/**
 * Cookie adını export et (API routes için)
 */
export const AUTH_COOKIE_NAME = COOKIE_NAME;
export const AUTH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 gün (saniye cinsinden)
