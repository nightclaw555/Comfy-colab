import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'studio_auth_token';

async function getAuthHash(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password + '_studio_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const expectedPassword = process.env.STUDIO_PASSWORD || '4281718';

    if (password && password.trim() === expectedPassword.trim()) {
      const hash = await getAuthHash(expectedPassword);
      const res = NextResponse.json({ success: true, message: 'Authenticated' });
      res.cookies.set(AUTH_COOKIE, hash, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });
      return res;
    }

    return NextResponse.json({ success: false, error: 'Incorrect PIN / Password' }, { status: 401 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: 'Logged out' });
  res.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return res;
}
