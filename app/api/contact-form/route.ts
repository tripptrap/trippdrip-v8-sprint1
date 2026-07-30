import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { limitByIp, observeRate } from '@/lib/rateLimit';

/**
 * POST /api/contact-form
 * Handles public contact form submissions
 * Creates a new lead with SMS consent information
 */

/** Per-IP, blocking. One submission per person; see /api/opt-in/submit (#99). */
const IP_LIMIT = 5;
const IP_WINDOW_SECONDS = 60;

/**
 * Whole-endpoint ceiling, alert-only. This is one shared form rather than a
 * per-business page, so a blocking global cap would let one caller take the
 * contact form down for everybody — the limit would become the outage.
 */
const TOTAL_CEILING = 100;
const TOTAL_WINDOW_SECONDS = 3600;

export async function POST(req: NextRequest) {
  try {
    // Public and unauthenticated, writing consent records with the service-role
    // key — the same exposure as /api/opt-in/submit, into the same table (#99).
    const limited = await limitByIp(req, 'contact-form', IP_LIMIT, IP_WINDOW_SECONDS);
    if (limited) return limited;

    await observeRate({
      key: 'contact-form:all',
      limit: TOTAL_CEILING,
      windowSeconds: TOTAL_WINDOW_SECONDS,
      title: 'Unusual volume on the public contact form',
      body: (count) =>
        `/api/contact-form has taken ${count} submissions in the last hour, past the ${TOTAL_CEILING} expected. Submissions are still being accepted — this ceiling does not block, because a global cap would let one caller take the form down for everyone. Worth checking whether the recent rows in contact_form_submissions are real.`,
    });

    const body = await req.json();
    const { firstName, lastName, email, phone, smsConsent, emailOptIn } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Validate phone format (should be E.164 format with country code)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // Require SMS consent
    if (!smsConsent) {
      return NextResponse.json(
        { error: 'SMS consent is required' },
        { status: 400 }
      );
    }

    // Service-role client: this is a public, unauthenticated form, so there is
    // no session for RLS to key off. RLS is now enabled on
    // contact_form_submissions (#56) and denies anonymous access outright —
    // writes have to come through a trusted server route like this one, which
    // validates the input above. Same pattern as /api/opt-in/submit.
    const supabase = createServiceRoleClient();

    // Check if this phone number already exists as a contact form submission
    const { data: existingLead } = await supabase
      .from('contact_form_submissions')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existingLead) {
      // Update existing submission
      const { error: updateError } = await supabase
        .from('contact_form_submissions')
        .update({
          first_name: firstName,
          last_name: lastName,
          email,
          sms_consent: smsConsent,
          email_opt_in: emailOptIn,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLead.id);

      if (updateError) {
        console.error('Error updating contact form submission:', updateError);
        throw new Error('Failed to update submission');
      }
    } else {
      // Create new submission
      const { error: insertError } = await supabase
        .from('contact_form_submissions')
        .insert({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          sms_consent: smsConsent,
          email_opt_in: emailOptIn,
          source: 'website_contact_form',
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        // If table doesn't exist, try storing in a general leads table or log
        console.error('Error creating contact form submission:', insertError);

        // Log the submission since DB insert failed
        console.error('Contact form DB insert failed. Submission data:', {
          firstName, lastName, email, phone, smsConsent, emailOptIn,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Form submitted successfully',
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Failed to submit form. Please try again.' },
      { status: 500 }
    );
  }
}
