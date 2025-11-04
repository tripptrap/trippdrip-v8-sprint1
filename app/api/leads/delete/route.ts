import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // Support bulk delete

    if (!id && !ids) {
      return NextResponse.json({ ok: false, error: 'Lead ID(s) required' }, { status: 400 });
    }

    // Parse IDs
    const idsToDelete = ids ? ids.split(',') : [id];

    // Read leads file
    if (!fs.existsSync(LEADS_FILE)) {
      return NextResponse.json({ ok: false, error: 'Leads file not found' }, { status: 404 });
    }

    const leadsData = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
    const leads = leadsData.items || [];

    // Filter out leads to delete
    const filteredLeads = leads.filter((l: any) => !idsToDelete.includes(String(l.id)));
    const deletedCount = leads.length - filteredLeads.length;

    if (deletedCount === 0) {
      return NextResponse.json({ ok: false, error: 'No leads found to delete' }, { status: 404 });
    }

    // Save updated leads
    fs.writeFileSync(
      LEADS_FILE,
      JSON.stringify({ items: filteredLeads }, null, 2),
      'utf-8'
    );

    return NextResponse.json({
      ok: true,
      message: `${deletedCount} lead(s) deleted successfully`,
      deletedCount
    });
  } catch (error: any) {
    console.error('Error deleting lead(s):', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete lead(s)' },
      { status: 500 }
    );
  }
}
