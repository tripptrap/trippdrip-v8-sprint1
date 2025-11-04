import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Campaign ID is required' }, { status: 400 });
    }

    // Read campaigns file
    if (!fs.existsSync(CAMPAIGNS_FILE)) {
      return NextResponse.json({ ok: false, error: 'Campaigns file not found' }, { status: 404 });
    }

    const campaignsData = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf-8'));
    const campaigns = campaignsData.items || [];

    // Find and remove campaign
    const campaignIndex = campaigns.findIndex((c: any) => c.id === id);

    if (campaignIndex === -1) {
      return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
    }

    campaigns.splice(campaignIndex, 1);

    // Save updated campaigns
    fs.writeFileSync(
      CAMPAIGNS_FILE,
      JSON.stringify({ items: campaigns }, null, 2),
      'utf-8'
    );

    return NextResponse.json({ ok: true, message: 'Campaign deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete campaign' },
      { status: 500 }
    );
  }
}
