import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, disposition } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Lead ID is required' }, { status: 400 });
    }

    if (!disposition) {
      return NextResponse.json({ ok: false, error: 'Disposition is required' }, { status: 400 });
    }

    // Validate disposition values
    const validDispositions = ['sold', 'not_interested', 'callback', 'qualified', 'nurture', null];
    if (!validDispositions.includes(disposition)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid disposition value' },
        { status: 400 }
      );
    }

    // Read leads file
    if (!fs.existsSync(LEADS_FILE)) {
      return NextResponse.json({ ok: false, error: 'Leads file not found' }, { status: 404 });
    }

    const leadsData = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
    const leads = leadsData.items || [];

    // Find and update lead
    const leadIndex = leads.findIndex((l: any) => String(l.id) === String(id));

    if (leadIndex === -1) {
      return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    // Update disposition and status based on disposition type
    leads[leadIndex].disposition = disposition;

    // Auto-update status based on disposition
    if (disposition === 'not_interested') {
      leads[leadIndex].status = 'archived';
    } else if (disposition === 'sold') {
      leads[leadIndex].status = 'sold';
    } else if (leads[leadIndex].status === 'archived' || leads[leadIndex].status === 'sold') {
      // If moving away from archived/sold, set back to active
      leads[leadIndex].status = 'active';
    }

    // Save updated leads
    fs.writeFileSync(
      LEADS_FILE,
      JSON.stringify({ items: leads }, null, 2),
      'utf-8'
    );

    return NextResponse.json({
      ok: true,
      message: 'Lead disposition updated successfully',
      lead: leads[leadIndex]
    });
  } catch (error: any) {
    console.error('Error updating lead disposition:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update disposition' },
      { status: 500 }
    );
  }
}
