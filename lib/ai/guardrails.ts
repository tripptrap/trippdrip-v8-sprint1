/**
 * AI Guardrails — safety limits on AI-generated messages
 */

export interface GuardrailConfig {
  maxMessageLength: number;
  prohibitedTopics: string[];
  maxAiResponsesPerHour: number;
  requireSpamCheck: boolean;
  maxDailyAiMessages: number;
}

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  maxMessageLength: 320, // ~2 SMS segments
  prohibitedTopics: [
    'medical advice',
    'legal advice',
    'guaranteed returns',
    'specific pricing',
    'competitor disparagement',
    'discriminatory language',
  ],
  maxAiResponsesPerHour: 50,
  requireSpamCheck: true,
  maxDailyAiMessages: 200,
};

export interface GuardrailResult {
  passed: boolean;
  message: string;
  violations: string[];
}

/**
 * Validate an AI-generated message against guardrail rules.
 * Returns { passed, message (possibly truncated), violations[] }
 */
export function applyGuardrails(
  message: string,
  config: GuardrailConfig = DEFAULT_GUARDRAILS
): GuardrailResult {
  const violations: string[] = [];
  let finalMessage = message.trim();

  // Length check — truncate if over limit
  if (finalMessage.length > config.maxMessageLength) {
    // Truncate at last word boundary within limit
    const truncated = finalMessage.substring(0, config.maxMessageLength);
    const lastSpace = truncated.lastIndexOf(' ');
    finalMessage = lastSpace > config.maxMessageLength * 0.7
      ? truncated.substring(0, lastSpace)
      : truncated;
    violations.push('Message truncated to max length');
  }

  // Prohibited topic check
  const lowerMsg = finalMessage.toLowerCase();
  for (const topic of config.prohibitedTopics) {
    if (lowerMsg.includes(topic.toLowerCase())) {
      violations.push(`Prohibited topic: ${topic}`);
    }
  }

  // Check for phone numbers / external links (AI shouldn't share these)
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(finalMessage) && !finalMessage.includes('{{')) {
    violations.push('AI attempted to include a phone number');
  }

  // Check for email addresses
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(finalMessage)) {
    violations.push('AI attempted to include an email address');
  }

  const hasProhibited = violations.some(v => v.startsWith('Prohibited topic') || v.startsWith('AI attempted'));

  return {
    passed: !hasProhibited,
    message: finalMessage,
    violations,
  };
}

/**
 * Check if user has exceeded AI rate limits.
 * Returns true if within limits, false if rate-limited.
 */
export async function checkRateLimit(
  supabase: any,
  userId: string,
  config: GuardrailConfig = DEFAULT_GUARDRAILS
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: hourlyCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_automated', true)
      .gte('created_at', oneHourAgo);

    if ((hourlyCount || 0) >= config.maxAiResponsesPerHour) {
      return { allowed: false, reason: `Hourly AI limit reached (${config.maxAiResponsesPerHour}/hr)` };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: dailyCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_automated', true)
      .gte('created_at', todayStart.toISOString());

    if ((dailyCount || 0) >= config.maxDailyAiMessages) {
      return { allowed: false, reason: `Daily AI limit reached (${config.maxDailyAiMessages}/day)` };
    }

    return { allowed: true };
  } catch {
    // On error, allow (don't block sends due to rate check failure)
    return { allowed: true };
  }
}
