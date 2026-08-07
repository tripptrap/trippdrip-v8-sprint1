import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// The IRS CP 575 (EIN assignment notice), stored against a 10DLC registration.
//
// Telnyx's brand API has no document field, so this is never forwarded to a
// carrier automatically and this route deliberately does not try. It exists
// because an UNVERIFIED brand is resolved by a human — Telnyx support, or a paid
// external vetting submission — and the first thing either asks for is proof of
// the EIN-to-legal-name pairing. Without somewhere to put it, the user has to go
// and find the letter again months after signup, which is when they no longer
// can.
//
// The file lands in the private `documents` bucket under `<user_id>/…`, which is
// the path shape the three existing storage policies already enforce. Uploading
// through the USER's client rather than the service-role one is deliberate: it
// keeps those policies in the loop instead of trusting this route's own check.

const MAX_BYTES = 5 * 1024 * 1024;

// An EIN letter is a PDF or a photo of one. Anything else is a mistake worth
// catching here rather than at the point someone opens it in a support ticket.
const ALLOWED = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/heic', 'heic'],
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'No file supplied' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.` },
      { status: 400 }
    );
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: 'Upload the EIN letter as a PDF, PNG, JPEG or HEIC.' },
      { status: 400 }
    );
  }

  // Fixed name, so re-uploading replaces rather than accumulating copies of a
  // tax document. `upsert` for the same reason.
  const path = `${user.id}/10dlc/ein-letter.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error('EIN document upload failed:', uploadError);
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  // Service role: `user_10dlc_registrations` only accepts writes from it.
  //
  // The row may not exist yet — someone can upload the letter before they have
  // filled in the business details — so this updates if there is a row and does
  // nothing if there is not, rather than inserting a half-registration that the
  // submit path would then have to reason about. The file is already stored
  // under the user's own prefix either way, so nothing is lost.
  const admin = createServiceRoleClient();
  const { data: reg } = await admin
    .from('user_10dlc_registrations')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (reg) {
    const { error: updateError } = await admin
      .from('user_10dlc_registrations')
      .update({
        ein_document_path: path,
        ein_document_name: file.name,
        ein_document_uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reg.id);

    // Checked, not assumed. supabase-js returns { error } rather than throwing,
    // so an unchecked write here would report success while the row still
    // pointed at nothing — which is how the file would go missing exactly when
    // someone needed it.
    if (updateError) {
      console.error('EIN document metadata write failed:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, path, name: file.name, linked: !!reg });
}

// A short-lived link, so the document can be viewed back without the bucket
// becoming public.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: reg } = await admin
    .from('user_10dlc_registrations')
    .select('ein_document_path, ein_document_name, ein_document_uploaded_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!reg?.ein_document_path) {
    return NextResponse.json({ ok: true, document: null });
  }

  const { data: signed, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(reg.ein_document_path, 300);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    document: {
      name: reg.ein_document_name,
      uploadedAt: reg.ein_document_uploaded_at,
      url: signed?.signedUrl ?? null,
    },
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: reg } = await admin
    .from('user_10dlc_registrations')
    .select('id, ein_document_path')
    .eq('user_id', user.id)
    .maybeSingle();

  if (reg?.ein_document_path) {
    await supabase.storage.from('documents').remove([reg.ein_document_path]);
    const { error: updateError } = await admin
      .from('user_10dlc_registrations')
      .update({
        ein_document_path: null,
        ein_document_name: null,
        ein_document_uploaded_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reg.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
