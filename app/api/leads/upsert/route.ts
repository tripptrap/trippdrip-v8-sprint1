import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { loadSettings, isEmailConfigured } from "@/lib/settingsStore";
import nodemailer from 'nodemailer';

export const runtime = "nodejs";
const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");

type Lead = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  tags?: string[];
  status?: string;
};

const fp = (l: Lead) =>
  `${(l.first_name || "").toLowerCase()}|${(l.last_name || "").toLowerCase()}|${(l.phone || "").replace(/\D/g, "")}`;

export async function POST(req: Request) {
  try {
    const lead = (await req.json()) as Lead;
    if (!lead) return NextResponse.json({ ok: false, error: "No lead" }, { status: 400 });

    await fs.mkdir(DATA_DIR, { recursive: true });

    let list: Lead[] = [];
    try {
      const raw = await fs.readFile(LEADS_FILE, "utf8");
      list = JSON.parse(raw);
    } catch {}

    const key = fp(lead);
    let updated = false;

    const next = list.map((l) => {
      if (fp(l) === key) {
        updated = true;
        return {
          ...l,
          ...lead,
          tags: Array.from(new Set([...(l.tags || []), ...(lead.tags || [])])).filter(Boolean),
        };
      }
      return l;
    });

    if (!updated) {
      next.push(lead);

      // Send welcome email to new lead if email is configured and lead has an email
      if (lead.email && isEmailConfigured()) {
        try {
          const settings = loadSettings();
          const emailConfig = settings.email!;

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
          }

          if (transporter) {
            const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there';

            await transporter.sendMail({
              from: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
              to: lead.email,
              subject: `Welcome to ${emailConfig.fromName}!`,
              text: `Hi ${leadName},\n\nThank you for your interest! We're excited to have you.\n\nWe'll be in touch soon.\n\nBest regards,\n${emailConfig.fromName}`,
              html: `
                <p>Hi ${leadName},</p>
                <p>Thank you for your interest! We're excited to have you.</p>
                <p>We'll be in touch soon.</p>
                <p>Best regards,<br>${emailConfig.fromName}</p>
              `,
              replyTo: emailConfig.replyTo || emailConfig.fromEmail,
            });

            // Save sent email record
            const emailsFile = path.join(DATA_DIR, "emails.json");
            let emails = [];
            try {
              const emailData = await fs.readFile(emailsFile, "utf8");
              emails = JSON.parse(emailData);
            } catch {}

            emails.push({
              id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              to: lead.email,
              subject: `Welcome to ${emailConfig.fromName}!`,
              body: `Hi ${leadName},\n\nThank you for your interest! We're excited to have you.\n\nWe'll be in touch soon.\n\nBest regards,\n${emailConfig.fromName}`,
              sent_at: new Date().toISOString(),
              status: 'sent',
              lead_id: undefined,
            });

            await fs.writeFile(emailsFile, JSON.stringify(emails, null, 2), "utf8");
          }
        } catch (emailError) {
          // Log but don't fail the lead creation if email fails
          console.error('Failed to send welcome email:', emailError);
        }
      }
    }

    await fs.writeFile(LEADS_FILE, JSON.stringify(next, null, 2), "utf8");

    return NextResponse.json({ ok: true, action: updated ? "updated" : "inserted", total: next.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Upsert failed" }, { status: 500 });
  }
}


