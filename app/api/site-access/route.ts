import { NextRequest, NextResponse } from 'next/server';

const ACCESS_PASSWORD = 'TrippDrip2025$ecure!Preview';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (password === ACCESS_PASSWORD) {
      const response = NextResponse.json({ success: true });

      // Set a cookie that expires in 30 days
      response.cookies.set('site-access-granted', ACCESS_PASSWORD, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });

      return response;
    } else {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
