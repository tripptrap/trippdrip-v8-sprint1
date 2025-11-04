import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    // Check password against environment variable
    const correctPassword = process.env.SITE_PASSWORD;

    if (!correctPassword) {
      return NextResponse.json(
        { success: false, error: 'Password not configured' },
        { status: 500 }
      );
    }

    if (password === correctPassword) {
      // Create response with auth cookie
      const response = NextResponse.json({ success: true });

      // Set cookie that expires in 30 days
      response.cookies.set('site-auth', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });

      return response;
    }

    return NextResponse.json(
      { success: false, error: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}
