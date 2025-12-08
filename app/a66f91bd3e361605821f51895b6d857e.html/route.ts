import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse('twilio-domain-verification=a66f91bd3e361605821f51895b6d857e', {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
