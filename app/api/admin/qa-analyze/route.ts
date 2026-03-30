export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  try {
    // Admin-only
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { image, itemLabel, status, comment, page, route } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Missing image' }, { status: 400 });
    }

    // Strip the data URL prefix if present — OpenAI wants just the base64
    const base64 = image.replace(/^data:image\/[a-z]+;base64,/, '');

    const systemPrompt = `You are a QA analyst reviewing screenshots from a web application called HyveWyre — a multi-tenant SaaS SMS marketing and lead management platform.

Your job is to analyze screenshots and provide clear, actionable QA feedback. Be specific about what you see.`;

    const userPrompt = `Analyze this screenshot from the QA backtest of HyveWyre.

Page: ${page || 'Unknown'} (${route || ''})
Test item: ${itemLabel || 'Unknown'}
Current status set by tester: ${status || 'untested'}
Tester's notes: ${comment || '(none)'}

Please provide:
1. **What I see** — Describe what's visible in the screenshot (UI elements, data, errors, states)
2. **Pass / Fail assessment** — Does this look correct based on what the test item is checking?
3. **Issues spotted** — Any visual bugs, broken layouts, missing data, error messages, or unexpected states
4. **Recommendation** — What status should this test item be marked, and what (if anything) needs to be fixed

Be concise and specific. If you can see an error message or broken UI element, describe it exactly.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: 'high',
              },
            },
            { type: 'text', text: userPrompt },
          ],
        },
      ],
      max_tokens: 600,
      temperature: 0.3,
    });

    const analysis = response.choices[0]?.message?.content?.trim() ?? 'No analysis returned.';

    return NextResponse.json({ analysis });
  } catch (err: any) {
    console.error('QA analyze error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Analysis failed' },
      { status: 500 }
    );
  }
}
