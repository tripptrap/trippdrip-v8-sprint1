import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSettings, isEmailConfigured } from "@/lib/settingsStore";
import nodemailer from 'nodemailer';

export const runtime = "nodejs";

type Lead = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  tags?: string[];
  status?: string;
};

export async function POST(req: Request) {
  try {
    const lead = (await req.json()) as Lead;
    if (!lead) return NextResponse.json({ ok: false, error: "No lead" }, { status: 400 });

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Check if lead exists by matching first_name, last_name, and phone
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id)
      .eq('first_name', lead.first_name || '')
      .eq('last_name', lead.last_name || '')
      .eq('phone', lead.phone || '');

    let updated = false;
    let leadData: any = null;

    if (existingLeads && existingLeads.length > 0) {
      // Update existing lead
      const existing = existingLeads[0];

      // Merge tags
      const mergedTags = Array.from(new Set([
        ...(existing.tags || []),
        ...(lead.tags || [])
      ])).filter(Boolean);

      const { data, error } = await supabase
        .from('leads')
        .update({
          ...lead,
          tags: mergedTags,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating lead:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      updated = true;
      leadData = data;
    } else {
      // Insert new lead
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...lead,
          user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting lead:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      leadData = data;

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

            // Save sent email record to Supabase
            await supabase.from('emails').insert({
              user_id: user.id,
              to: lead.email,
              subject: `Welcome to ${emailConfig.fromName}!`,
              body: `Hi ${leadName},\n\nThank you for your interest! We're excited to have you.\n\nWe'll be in touch soon.\n\nBest regards,\n${emailConfig.fromName}`,
              sent_at: new Date().toISOString(),
              status: 'sent',
              lead_id: leadData.id,
            });
          }
        } catch (emailError) {
          // Log but don't fail the lead creation if email fails
          console.error('Failed to send welcome email:', emailError);
        }
      }
    }

    // Get total count
    const { count } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      action: updated ? "updated" : "inserted",
      total: count || 0,
      lead: leadData
    });
  } catch (e: any) {
    console.error('Error in upsert:', e);
    return NextResponse.json({ ok: false, error: e?.message || "Upsert failed" }, { status: 500 });
  }
}
