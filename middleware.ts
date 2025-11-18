import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Login sayfası ve auth API'leri için kontrol yapma
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Cookie'den token'ı al
  const token = request.cookies.get(AUTH_COOKIE_NAME);

  // Token yoksa login'e yönlendir
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Token'ı doğrula (async)
  const authToken = await verifyToken(token.value);

  if (!authToken || !authToken.authenticated) {
    // Token geçersiz - login'e yönlendir
    const response = NextResponse.redirect(new URL('/login', request.url));

    // Geçersiz cookie'yi sil
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: '',
      maxAge: 0,
    });

    return response;
  }

  // Token geçerli - devam et
  return NextResponse.next();
}

// Middleware'in çalışacağı route'lar
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
