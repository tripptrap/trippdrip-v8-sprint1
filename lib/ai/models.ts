/**
 * AI Model Configurations
 * Model V1: Original prompts and settings
 * Model V2: Clean slate - customize from scratch
 */

export type AIModelVersion = 'v1' | 'v2';

export interface AIModelConfig {
  version: AIModelVersion;
  name: string;
  description: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  presencePenalty: number;
  frequencyPenalty: number;
  model: string;
}

/**
 * Model V1 - Original HyveWyre AI
 * The tried and tested prompts that work well for insurance/real estate
 */
export const MODEL_V1: AIModelConfig = {
  version: 'v1',
  name: 'Model V1 (Original)',
  description: 'The original HyveWyre AI - optimized for insurance and real estate conversations',
  model: 'gpt-4o-mini',
  temperature: 0.75,
  maxTokens: 150,
  presencePenalty: 0.3,
  frequencyPenalty: 0.2,
  systemPrompt: `You are a friendly, professional insurance/real estate agent texting {{leadName}}. You're having a real SMS conversation - keep it natural and human.

LEAD CONTEXT:
- Name: {{leadName}}
- Location: {{leadLocation}}
- Status: {{leadStatus}}
{{leadTags}}

YOUR PERSONALITY:
- Warm but professional
- Helpful and knowledgeable
- Never pushy or salesy
- Genuinely interested in helping them

SMS WRITING RULES:
1. Keep it SHORT - max 2 sentences, ideally 1
2. Sound like a REAL person texting, not a bot
3. Use their first name naturally (not every message)
4. Answer questions DIRECTLY first, then follow up
5. One question per message MAX
6. Use casual punctuation - periods ok, exclamation marks sparingly
7. No emojis unless they use them first
8. Never say "I'd be happy to" or "I appreciate" - too formal for texts

RESPONSE PATTERNS BY SITUATION:

If they ask a question → Answer it directly, then one follow-up
Example: "Yes, we can definitely help with that. What's your current coverage like?"

If they seem interested → Move toward next step
Example: "Great! Want to hop on a quick 10-min call tomorrow to go over options?"

If they're hesitant → Acknowledge and offer value
Example: "No pressure at all. Want me to just send over some info to review?"

If they go quiet → Gentle check-in
Example: "Hey {{leadFirstName}}, still interested in getting that quote?"

{{flowGuidance}}

Remember: You're a helpful human, not a sales script. Match their vibe and keep it real.`
};

/**
 * Model V2 - Clean Slate
 * Start fresh and build your own AI personality
 */
export const MODEL_V2: AIModelConfig = {
  version: 'v2',
  name: 'Model V2 (Custom)',
  description: 'Build your own AI from scratch - no preset prompts',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 150,
  presencePenalty: 0.0,
  frequencyPenalty: 0.0,
  systemPrompt: '' // Empty - user will configure this
};

/**
 * Get model configuration by version
 */
export function getModelConfig(version: AIModelVersion): AIModelConfig {
  switch (version) {
    case 'v1':
      return MODEL_V1;
    case 'v2':
      return MODEL_V2;
    default:
      return MODEL_V1;
  }
}

/**
 * Build the final system prompt with variable substitution
 */
export function buildSystemPrompt(
  config: AIModelConfig,
  context: {
    leadName?: string;
    leadFirstName?: string;
    leadLocation?: string;
    leadStatus?: string;
    leadTags?: string[];
    flowGuidance?: string;
    isNewConversation?: boolean;
    customPrompt?: string; // For V2 - user's custom prompt
  }
): string {
  // For V2, use the custom prompt if provided
  if (config.version === 'v2') {
    if (context.customPrompt) {
      return substituteVariables(context.customPrompt, context);
    }
    // If no custom prompt set, return a minimal default
    return `You are an AI assistant. Respond helpfully and concisely.`;
  }

  // For V1, use the built-in system prompt
  return substituteVariables(config.systemPrompt, context);
}

/**
 * Replace template variables in prompt
 */
function substituteVariables(
  template: string,
  context: {
    leadName?: string;
    leadFirstName?: string;
    leadLocation?: string;
    leadStatus?: string;
    leadTags?: string[];
    flowGuidance?: string;
    isNewConversation?: boolean;
  }
): string {
  let result = template;

  result = result.replace(/\{\{leadName\}\}/g, context.leadName || 'there');
  result = result.replace(/\{\{leadFirstName\}\}/g, context.leadFirstName || context.leadName?.split(' ')[0] || 'there');
  result = result.replace(/\{\{leadLocation\}\}/g, context.leadLocation || 'Unknown');
  result = result.replace(/\{\{leadStatus\}\}/g, context.leadStatus || 'New lead');
  result = result.replace(/\{\{leadTags\}\}/g, context.leadTags?.length ? `- Tags: ${context.leadTags.join(', ')}` : '');
  result = result.replace(/\{\{flowGuidance\}\}/g, context.flowGuidance || '');

  return result;
}

/**
 * Default user settings for AI models
 */
export interface UserAISettings {
  selectedModel: AIModelVersion;
  v2Config: {
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    presencePenalty: number;
    frequencyPenalty: number;
  };
}

export const DEFAULT_USER_AI_SETTINGS: UserAISettings = {
  selectedModel: 'v1',
  v2Config: {
    systemPrompt: '',
    temperature: 0.7,
    maxTokens: 150,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0
  }
};
