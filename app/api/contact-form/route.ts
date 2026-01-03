import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/contact-form
 * Handles public contact form submissions
 * Creates a new lead with SMS consent information
 */
export async function POST(req: NextRequest) {
  try {
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

    // Store in database
    const supabase = await createClient();

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

        // Fallback: Try to store as a general inquiry
        const { error: fallbackError } = await supabase
          .from('inquiries')
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

        if (fallbackError) {
          // Log the submission even if DB fails
          console.log('Contact form submission (DB unavailable):', {
            firstName,
            lastName,
            email,
            phone,
            smsConsent,
            emailOptIn,
            timestamp: new Date().toISOString(),
          });
        }
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
