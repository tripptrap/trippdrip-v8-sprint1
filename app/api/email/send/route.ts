import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@/lib/supabase/server';
import { spendPoints } from '@/lib/pointsSupabaseServer';
import { safeDecrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL_CREDIT_COST = 1;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { to, subject, body, html, lead_id } = await request.json();

    if (!to || !subject || (!body && !html)) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, and body/html' },
        { status: 400 }
      );
    }

    // Check credits before sending
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('credits')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'Failed to check credit balance' }, { status: 500 });
    }
    if ((userData.credits || 0) < EMAIL_CREDIT_COST) {
      return NextResponse.json(
        { error: `Insufficient credits. Emails cost ${EMAIL_CREDIT_COST} credit each.` },
        { status: 402 }
      );
    }

    // Load this user's own email configuration
    const { data: settingsRow, error: settingsError } = await supabase
      .from('user_settings')
      .select('email_config')
      .eq('user_id', user.id)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Error loading email settings:', settingsError);
      return NextResponse.json({ error: 'Failed to load email settings' }, { status: 500 });
    }

    const emailConfig = settingsRow?.email_config;
    if (!emailConfig || emailConfig.provider === 'none') {
      return NextResponse.json(
        { error: 'Email not configured. Please configure email settings first.' },
        { status: 400 }
      );
    }

    // Create transporter based on provider
    let transporter;

    if (emailConfig.provider === 'smtp') {
      transporter = nodemailer.createTransport({
        host: emailConfig.smtpHost,
        port: emailConfig.smtpPort || 587,
        secure: emailConfig.smtpSecure || false,
        auth: {
          user: emailConfig.smtpUser,
          pass: safeDecrypt(emailConfig.smtpPass),
        },
      });
    } else if (emailConfig.provider === 'sendgrid') {
      transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: safeDecrypt(emailConfig.sendgridApiKey),
        },
      });
    } else {
      return NextResponse.json(
        { error: 'Unsupported email provider' },
        { status: 400 }
      );
    }

    // Send email
    const mailOptions = {
      from: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
      to,
      subject,
      text: body,
      html: html || body,
      replyTo: emailConfig.replyTo || emailConfig.fromEmail,
    };

    try {
      const info = await transporter.sendMail(mailOptions);

      await supabase.from('emails').insert({
        user_id: user.id,
        lead_id: lead_id || null,
        to,
        subject,
        body: body || html,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });

      const spendResult = await spendPoints(EMAIL_CREDIT_COST, 'Email sent (1x)');
      if (!spendResult.success) {
        console.error('Email sent but failed to deduct credit:', spendResult.error);
      }

      return NextResponse.json({
        success: true,
        messageId: info.messageId,
        pointsUsed: EMAIL_CREDIT_COST,
        balance: spendResult.balance,
      });
    } catch (error: any) {
      await supabase.from('emails').insert({
        user_id: user.id,
        lead_id: lead_id || null,
        to,
        subject,
        body: body || html,
        status: 'failed',
        sent_at: new Date().toISOString(),
      });

      return NextResponse.json(
        { error: `Failed to send email: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
