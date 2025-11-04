import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const EMAILS_FILE = path.join(process.cwd(), 'data', 'emails.json');

export async function GET(request: NextRequest) {
  try {
    if (!fs.existsSync(EMAILS_FILE)) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const data = fs.readFileSync(EMAILS_FILE, 'utf-8');
    const emails = JSON.parse(data);

    // Sort by sent_at descending (newest first)
    emails.sort((a: any, b: any) =>
      new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );

    return NextResponse.json({ ok: true, items: emails });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load emails' },
      { status: 500 }
    );
  }
}
