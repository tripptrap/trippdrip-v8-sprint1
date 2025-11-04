import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { loadSettings } from '@/lib/settingsStore';
import { spendPointsForAction, canAffordAction } from '@/lib/pointsStore';
import fs from 'fs';
import path from 'path';

type SentEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  sent_at: string;
  status: 'sent' | 'failed';
  error?: string;
  lead_id?: number;
};

const EMAILS_FILE = path.join(process.cwd(), 'data', 'emails.json');

function loadEmails(): SentEmail[] {
  try {
    if (!fs.existsSync(EMAILS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(EMAILS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveEmail(email: SentEmail): void {
  const emails = loadEmails();
  emails.push(email);

  const dir = path.dirname(EMAILS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(EMAILS_FILE, JSON.stringify(emails, null, 2));
}

export async function POST(request: NextRequest) {
  try {
    const { to, subject, body, html, lead_id } = await request.json();

    if (!to || !subject || (!body && !html)) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, and body/html' },
        { status: 400 }
      );
    }

    // Check points (0.5 points per email)
    if (!canAffordAction('email_sent', 1)) {
      return NextResponse.json(
        { error: 'Insufficient points. Emails cost 0.5 points each.' },
        { status: 402 }
      );
    }

    // Load email configuration
    const settings = loadSettings();
    if (!settings.email || settings.email.provider === 'none') {
      return NextResponse.json(
        { error: 'Email not configured. Please configure email settings first.' },
        { status: 400 }
      );
    }

    const emailConfig = settings.email;

    // Create transporter based on provider
    let transporter;

    if (emailConfig.provider === 'smtp') {
      transporter = nodemailer.createTransport({
        host: emailConfig.smtpHost,
        port: emailConfig.smtpPort || 587,
        secure: emailConfig.smtpSecure || false,
        auth: {
          user: emailConfig.smtpUser,
          pass: emailConfig.smtpPass,
        },
      });
    } else if (emailConfig.provider === 'sendgrid') {
      transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: emailConfig.sendgridApiKey,
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

    const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const info = await transporter.sendMail(mailOptions);

      // Save sent email
      const sentEmail: SentEmail = {
        id: emailId,
        to,
        subject,
        body: body || html,
        sent_at: new Date().toISOString(),
        status: 'sent',
        lead_id,
      };
      saveEmail(sentEmail);

      // Deduct points
      spendPointsForAction('email_sent', 1);

      return NextResponse.json({
        success: true,
        emailId,
        messageId: info.messageId,
        pointsUsed: 0.5,
      });
    } catch (error: any) {
      // Save failed email
      const failedEmail: SentEmail = {
        id: emailId,
        to,
        subject,
        body: body || html,
        sent_at: new Date().toISOString(),
        status: 'failed',
        error: error.message,
        lead_id,
      };
      saveEmail(failedEmail);

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
