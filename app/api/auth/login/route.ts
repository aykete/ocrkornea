import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, createToken, AUTH_COOKIE_NAME, AUTH_TOKEN_EXPIRY } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: 'Şifre gerekli' },
        { status: 400 }
      );
    }

    // Şifreyi kontrol et
    if (!verifyPassword(password)) {
      return NextResponse.json(
        { error: 'Yanlış şifre' },
        { status: 401 }
      );
    }

    // JWT token oluştur (async)
    const token = await createToken();

    // Cookie'yi set et
    const response = NextResponse.json({
      success: true,
      message: 'Giriş başarılı',
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: AUTH_TOKEN_EXPIRY,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Giriş işlemi başarısız' },
      { status: 500 }
    );
  }
}
