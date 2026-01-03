/**
 * SMS Spam Detection Utility
 * Detects common spam trigger words and provides AI-powered alternatives
 */

// Common SMS spam trigger words categorized by severity
export const SPAM_TRIGGERS = {
  // High risk - these almost always trigger spam filters
  high: [
    'free', 'winner', 'won', 'prize', 'cash', 'urgent', 'act now',
    'limited time', 'exclusive deal', 'congratulations', 'claim now',
    'click here', 'buy now', 'order now', 'call now', 'text now',
    'guaranteed', '100%', 'risk free', 'no obligation', 'no cost',
    'double your', 'earn money', 'make money', 'extra income',
    'work from home', 'be your own boss', 'financial freedom',
    'million dollars', 'billion', 'lottery', 'selected', 'chosen',
    'casino', 'bet', 'gambling', 'xxx', 'adult', 'hot singles',
    'nigerian', 'prince', 'inheritance', 'wire transfer',
  ],

  // Medium risk - often flagged depending on context
  medium: [
    'discount', 'sale', 'offer', 'deal', 'promotion', 'special',
    'save', 'savings', 'cheap', 'lowest price', 'best price',
    'limited', 'expires', 'deadline', 'hurry', 'dont miss',
    'act fast', 'last chance', 'final notice', 'reminder',
    'unsubscribe', 'opt out', 'stop', 'cancel anytime',
    'credit', 'debt', 'loan', 'mortgage', 'refinance',
    'insurance', 'quote', 'rates', 'apr', 'interest',
    'weight loss', 'diet', 'pills', 'supplement', 'medication',
    'viagra', 'pharmacy', 'prescription', 'doctor',
    'click', 'link', 'website', 'visit', 'check out',
  ],

  // Low risk - context dependent, usually fine in moderation
  low: [
    'amazing', 'incredible', 'awesome', 'fantastic', 'great',
    'opportunity', 'chance', 'benefit', 'advantage',
    'new', 'improved', 'better', 'best', 'top',
    'today', 'now', 'immediately', 'quickly', 'fast',
    'easy', 'simple', 'quick', 'instant',
    'info', 'information', 'details', 'learn more',
    'sign up', 'register', 'join', 'subscribe',
    'bonus', 'gift', 'reward', 'points',
  ],
};

// Suspicious patterns (regex)
export const SPAM_PATTERNS = [
  /\$\d+/g,                           // Dollar amounts like $100
  /\d+%\s*(off|discount|savings)/gi,  // Percentage discounts
  /bit\.ly|tinyurl|goo\.gl|t\.co/gi,  // URL shorteners
  /[A-Z]{5,}/g,                       // ALL CAPS words (5+ chars)
  /!{2,}/g,                           // Multiple exclamation marks
  /\?{2,}/g,                          // Multiple question marks
  /(.)\1{3,}/g,                       // Repeated characters (heeeelp)
  /\d{10,}/g,                         // Long number strings
  /https?:\/\/[^\s]+/gi,              // URLs (flagged more often)
];

export interface SpamWord {
  word: string;
  severity: 'high' | 'medium' | 'low';
  index: number;
  length: number;
}

export interface SpamAnalysis {
  score: number;          // 0-100, higher = more spammy
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  spamWords: SpamWord[];
  patterns: string[];
  suggestions: string[];
}

/**
 * Analyzes a message for spam trigger words and patterns
 */
export function analyzeSpamContent(message: string): SpamAnalysis {
  const lowerMessage = message.toLowerCase();
  const spamWords: SpamWord[] = [];
  const patterns: string[] = [];
  let score = 0;

  // Check high severity words (10 points each)
  SPAM_TRIGGERS.high.forEach(word => {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(lowerMessage)) !== null) {
      spamWords.push({
        word: match[0],
        severity: 'high',
        index: match.index,
        length: match[0].length,
      });
      score += 10;
    }
  });

  // Check medium severity words (5 points each)
  SPAM_TRIGGERS.medium.forEach(word => {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(lowerMessage)) !== null) {
      spamWords.push({
        word: match[0],
        severity: 'medium',
        index: match.index,
        length: match[0].length,
      });
      score += 5;
    }
  });

  // Check low severity words (2 points each)
  SPAM_TRIGGERS.low.forEach(word => {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(lowerMessage)) !== null) {
      spamWords.push({
        word: match[0],
        severity: 'low',
        index: match.index,
        length: match[0].length,
      });
      score += 2;
    }
  });

  // Check patterns (8 points each)
  SPAM_PATTERNS.forEach((pattern, idx) => {
    const matches = message.match(pattern);
    if (matches) {
      matches.forEach(match => {
        patterns.push(match);
        score += 8;
      });
    }
  });

  // Normalize score to 0-100
  score = Math.min(100, score);

  // Determine risk level
  let riskLevel: SpamAnalysis['riskLevel'];
  if (score === 0) riskLevel = 'safe';
  else if (score <= 15) riskLevel = 'low';
  else if (score <= 35) riskLevel = 'medium';
  else if (score <= 60) riskLevel = 'high';
  else riskLevel = 'critical';

  // Generate basic suggestions
  const suggestions = generateBasicSuggestions(spamWords);

  return {
    score,
    riskLevel,
    spamWords,
    patterns,
    suggestions,
  };
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates basic replacement suggestions for spam words
 */
function generateBasicSuggestions(spamWords: SpamWord[]): string[] {
  const suggestions: string[] = [];
  const seen = new Set<string>();

  const replacements: Record<string, string> = {
    // High risk replacements
    'free': 'complimentary',
    'winner': 'recipient',
    'won': 'earned',
    'prize': 'reward',
    'cash': 'funds',
    'urgent': 'time-sensitive',
    'act now': 'respond soon',
    'limited time': 'for a short period',
    'exclusive deal': 'special opportunity',
    'congratulations': 'great news',
    'claim now': 'get started',
    'click here': 'see details',
    'buy now': 'get yours',
    'guaranteed': 'we ensure',
    '100%': 'fully',
    'risk free': 'worry-free',
    'no obligation': 'no commitment needed',

    // Medium risk replacements
    'discount': 'reduced rate',
    'sale': 'event',
    'offer': 'opportunity',
    'deal': 'arrangement',
    'promotion': 'program',
    'special': 'unique',
    'save': 'keep more',
    'cheap': 'affordable',
    'expires': 'ends',
    'hurry': 'please respond',
    'dont miss': 'consider this',
    'last chance': 'final opportunity',
    'unsubscribe': 'opt-out',
  };

  spamWords.forEach(({ word }) => {
    const lowerWord = word.toLowerCase();
    if (!seen.has(lowerWord) && replacements[lowerWord]) {
      suggestions.push(`Replace "${word}" with "${replacements[lowerWord]}"`);
      seen.add(lowerWord);
    }
  });

  return suggestions;
}

/**
 * Prompt for AI to rewrite message avoiding spam triggers
 */
export function getSpamFreeRewritePrompt(message: string, spamWords: SpamWord[]): string {
  const wordsToAvoid = [...new Set(spamWords.map(w => w.word.toLowerCase()))];

  return `You are an expert at writing SMS messages that avoid spam filters while maintaining the original meaning and intent.

ORIGINAL MESSAGE:
"${message}"

SPAM TRIGGER WORDS DETECTED:
${wordsToAvoid.join(', ')}

REWRITE GUIDELINES:
1. Preserve the exact meaning and intent of the original message
2. Replace spam trigger words with natural alternatives
3. Keep the tone conversational and authentic
4. Avoid ALL CAPS, excessive punctuation, and urgency language
5. Keep URLs minimal or remove shortened URLs
6. Make it sound like a real person wrote it
7. Keep it concise (under 160 characters if possible for single SMS)
8. Do NOT use any of these words: ${wordsToAvoid.join(', ')}

Return ONLY the rewritten message, nothing else.`;
}
