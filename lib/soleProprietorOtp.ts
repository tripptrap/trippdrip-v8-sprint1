/**
 * The sole-proprietor OTP exchange with Telnyx, done on the customer's behalf.
 *
 * ── Why this is email and not an API call ──────────────────────────────────
 *
 * Telnyx verify a SOLE_PROPRIETOR brand by texting a PIN to the person's mobile
 * and taking it back by email, inside 24 hours. There is no endpoint for any part
 * of it — `2faEmail`, `otp`, `verification` and `revet` all 404 on a live brand
 * (#194). Their support confirmed the process and that "an ISV/CSP can assist".
 *
 * So the shape is: we ask, they text the customer, the customer tells us the PIN,
 * we relay it. Two outbound emails, no inbound handling — the PIN arrives by SMS
 * on the customer's phone, never in our mailbox.
 *
 * ── Threading ──────────────────────────────────────────────────────────────
 *
 * Telnyx have not yet said whether the PIN must be a reply on their thread or may
 * be a new message quoting the brand. It does not matter: we send the request, so
 * we know its Message-ID, and set In-Reply-To on the PIN. It threads either way,
 * and the body quotes the brand id for the case where a human answered from a
 * different address.
 *
 * ── Why sending is gated ───────────────────────────────────────────────────
 *
 * `TENDLC_OTP_AUTOSEND` is off by default. Until Telnyx confirm a platform may
 * relay the PIN rather than the sole proprietor mailing them directly, every
 * message goes to the operator instead, who forwards it after reading it. The
 * feature is fully built either way — the switch decides the recipient, not
 * whether the flow works.
 */

import { sendEmail } from './sendEmail';
import { createServiceRoleClient } from './supabase/server';

const TELNYX_10DLC_EMAIL = '10dlcquestions@telnyx.com';

/** Off unless deliberately enabled. Never read from a request body. */
function autosendEnabled(): boolean {
  return process.env.TENDLC_OTP_AUTOSEND?.trim() === 'true';
}

/** Where a gated message goes instead. */
function operatorInbox(): string | null {
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
  return admins[0] ?? null;
}

function replyToAddress(): string {
  // Telnyx answer a person. FROM_EMAIL is a noreply, so without this their reply
  // is delivered to a mailbox nobody reads.
  return process.env.TENDLC_OTP_REPLY_TO?.trim() || process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || '';
}

export interface OtpRelayResult {
  ok: boolean;
  error?: string;
  /** True when the message went to Telnyx; false when it was routed to the operator. */
  sentToTelnyx?: boolean;
  messageId?: string;
}

type Registration = {
  id: string;
  user_id: string;
  entity_type: string;
  legal_business_name: string;
  first_name: string | null;
  last_name: string | null;
  mobile_phone: string | null;
  brand_id: string | null;
  tcr_brand_id: string | null;
  ein_document_path: string | null;
  otp_consent_at: string | null;
  otp_request_message_id: string | null;
};

async function loadRegistration(userId: string): Promise<{ reg?: Registration; error?: string }> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('user_10dlc_registrations')
    .select('id, user_id, entity_type, legal_business_name, first_name, last_name, mobile_phone, brand_id, tcr_brand_id, ein_document_path, otp_consent_at, otp_request_message_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'No registration found' };
  if (data.entity_type !== 'SOLE_PROPRIETOR') return { error: 'Only sole proprietor registrations use the OTP step' };
  if (!data.brand_id) return { error: 'No brand has been created yet' };
  return { reg: data as Registration };
}

/**
 * Telnyx ask for tcrBrandId as well as brandId. We do not store it at creation —
 * it only appears once TCR has the brand — so it is fetched and cached here
 * rather than being another thing that can be stale.
 */
async function resolveTcrBrandId(reg: Registration): Promise<string | null> {
  if (reg.tcr_brand_id) return reg.tcr_brand_id;
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) return null;

  try {
    const res = await fetch(`https://api.telnyx.com/v2/10dlc/brand/${reg.brand_id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tcr = data?.tcrBrandId ?? data?.data?.tcrBrandId ?? null;
    if (tcr) {
      const admin = createServiceRoleClient();
      await admin.from('user_10dlc_registrations').update({ tcr_brand_id: tcr }).eq('id', reg.id);
    }
    return tcr;
  } catch {
    return null;
  }
}

/** The CP 575, as an attachment. Null when there is nothing on file. */
async function loadEinDocument(reg: Registration): Promise<{ filename: string; content: Buffer } | null> {
  if (!reg.ein_document_path) return null;
  const admin = createServiceRoleClient();
  const { data, error } = await admin.storage.from('documents').download(reg.ein_document_path);
  if (error || !data) {
    console.error('OTP relay: could not read the EIN document:', error);
    return null;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const ext = reg.ein_document_path.split('.').pop() || 'pdf';
  return { filename: `CP575-${reg.legal_business_name.replace(/[^\w-]+/g, '-')}.${ext}`, content: buf };
}

/** Step 1: ask Telnyx to issue the PIN. */
export async function requestOtpPin(userId: string): Promise<OtpRelayResult> {
  const { reg, error } = await loadRegistration(userId);
  if (!reg) return { ok: false, error };

  // Consent is checked here, not just in the UI. This function is what actually
  // transmits someone's tax document to a third party, so it is the boundary.
  if (!reg.otp_consent_at) {
    return { ok: false, error: 'The user has not agreed to their EIN letter being sent to Telnyx.' };
  }

  const tcr = await resolveTcrBrandId(reg);
  const attachment = await loadEinDocument(reg);
  const name = [reg.first_name, reg.last_name].filter(Boolean).join(' ') || reg.legal_business_name;

  const lines = [
    'Hello,',
    '',
    'Please issue a 10DLC OTP PIN for the following SOLE_PROPRIETOR brand.',
    '',
    `  Legal name:   ${reg.legal_business_name}`,
    `  Individual:   ${name}`,
    `  brandId:      ${reg.brand_id}`,
    `  tcrBrandId:   ${tcr ?? '(not yet issued)'}`,
    `  Mobile:       ${reg.mobile_phone ?? '(not on file)'}`,
    '',
    attachment
      ? 'The IRS CP 575 EIN confirmation letter is attached, with the account holder’s consent.'
      : 'No CP 575 is on file for this account.',
    '',
    'We will return the PIN by replying to this message once the account holder has',
    'received it. Sent by HyveWyre LLC (CSP SS4XJ6D) on their behalf.',
    '',
    'Thank you,',
    'HyveWyre',
  ];
  const text = lines.join('\n');

  const toTelnyx = autosendEnabled();
  const recipient = toTelnyx ? TELNYX_10DLC_EMAIL : operatorInbox();
  if (!recipient) {
    return { ok: false, error: 'No operator inbox configured (ADMIN_EMAILS) and autosend is off.' };
  }

  const subject = toTelnyx
    ? `10DLC OTP PIN request — ${reg.legal_business_name} (${tcr ?? reg.brand_id})`
    : `[REVIEW — not sent to Telnyx] OTP PIN request for ${reg.legal_business_name}`;

  const preamble = toTelnyx
    ? ''
    : `This message was NOT sent to Telnyx. TENDLC_OTP_AUTOSEND is off, so it is here for you to\nread and forward to ${TELNYX_10DLC_EMAIL} if it looks right.\n\n----\n\n`;

  const result = await sendEmail({
    to: recipient,
    subject,
    text: preamble + text,
    html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${(preamble + text).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</pre>`,
    replyTo: replyToAddress() || undefined,
    attachments: attachment ? [{ filename: attachment.filename, content: attachment.content }] : undefined,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const admin = createServiceRoleClient();
  const { error: writeError } = await admin
    .from('user_10dlc_registrations')
    .update({
      otp_requested_at: new Date().toISOString(),
      // Only stored when it actually went to Telnyx. Threading a PIN onto a
      // message that never reached them would be worse than not threading.
      ...(toTelnyx && result.messageId ? { otp_request_message_id: result.messageId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', reg.id);

  if (writeError) {
    // The email is gone either way; failing here would tell the user to send it
    // again and produce two PINs.
    console.error('OTP relay: request sent but not recorded:', writeError);
  }

  return { ok: true, sentToTelnyx: toTelnyx, messageId: result.messageId };
}

/** Step 2: relay the PIN the customer received by SMS. */
export async function relayOtpPin(userId: string, pin: string): Promise<OtpRelayResult> {
  const { reg, error } = await loadRegistration(userId);
  if (!reg) return { ok: false, error };

  const clean = pin.trim();
  // Deliberately loose. Telnyx have not documented the PIN format, and rejecting
  // a valid one because it is seven digits or carries a dash would strand the
  // user with a 24-hour clock running.
  if (!/^[A-Za-z0-9-]{4,12}$/.test(clean)) {
    return { ok: false, error: 'That does not look like the PIN Telnyx sent. Check the text message and try again.' };
  }

  const tcr = await resolveTcrBrandId(reg);
  const toTelnyx = autosendEnabled();
  const recipient = toTelnyx ? TELNYX_10DLC_EMAIL : operatorInbox();
  if (!recipient) {
    return { ok: false, error: 'No operator inbox configured (ADMIN_EMAILS) and autosend is off.' };
  }

  const text = [
    'Hello,',
    '',
    `The OTP PIN for the SOLE_PROPRIETOR brand below is: ${clean}`,
    '',
    `  Legal name:   ${reg.legal_business_name}`,
    `  brandId:      ${reg.brand_id}`,
    `  tcrBrandId:   ${tcr ?? '(not yet issued)'}`,
    '',
    // The brand is quoted because a reply header alone is not enough if a human
    // answered our request from a different address than the one we wrote to.
    'Quoting the brand ids above in case this does not thread with the original request.',
    '',
    'Thank you,',
    'HyveWyre',
  ].join('\n');

  const preamble = toTelnyx
    ? ''
    : `This message was NOT sent to Telnyx. TENDLC_OTP_AUTOSEND is off — forward it to ${TELNYX_10DLC_EMAIL}.\n\n----\n\n`;

  const result = await sendEmail({
    to: recipient,
    subject: toTelnyx
      ? `Re: 10DLC OTP PIN request — ${reg.legal_business_name} (${tcr ?? reg.brand_id})`
      : `[REVIEW — not sent to Telnyx] OTP PIN for ${reg.legal_business_name}`,
    text: preamble + text,
    html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${(preamble + text).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</pre>`,
    replyTo: replyToAddress() || undefined,
    inReplyTo: reg.otp_request_message_id || undefined,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const admin = createServiceRoleClient();
  const { error: writeError } = await admin
    .from('user_10dlc_registrations')
    .update({ otp_pin_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', reg.id);

  if (writeError) console.error('OTP relay: PIN sent but not recorded:', writeError);

  return { ok: true, sentToTelnyx: toTelnyx, messageId: result.messageId };
}
