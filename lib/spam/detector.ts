/**
 * Spam Word Detection and Replacement Utility
 * Detects common spam trigger words and suggests alternatives
 */

export interface SpamWord {
  word: string;
  alternatives: string[];
  severity: 'high' | 'medium' | 'low';
  category: string;
}

export interface SpamDetectionResult {
  isSpammy: boolean;
  spamScore: number;
  detectedWords: Array<{
    word: string;
    position: number;
    severity: 'high' | 'medium' | 'low';
    alternatives: string[];
    category: string;
  }>;
  suggestions: string[];
  cleanedMessage?: string;
}

// Comprehensive spam word database
const SPAM_WORDS: SpamWord[] = [
  // Money/Financial (High Risk)
  { word: 'free money', alternatives: ['special offer', 'limited opportunity', 'exclusive access'], severity: 'high', category: 'financial' },
  { word: 'cash bonus', alternatives: ['reward', 'incentive', 'benefit'], severity: 'high', category: 'financial' },
  { word: 'prize', alternatives: ['reward', 'gift', 'bonus'], severity: 'high', category: 'financial' },
  { word: 'winner', alternatives: ['selected', 'qualified', 'eligible'], severity: 'high', category: 'financial' },
  { word: '$$$', alternatives: ['savings', 'value', 'benefit'], severity: 'high', category: 'financial' },
  { word: 'earn money', alternatives: ['increase income', 'financial opportunity', 'compensation'], severity: 'high', category: 'financial' },
  { word: 'get paid', alternatives: ['receive compensation', 'earn income', 'get compensated'], severity: 'high', category: 'financial' },

  // Urgency/Pressure (High Risk)
  { word: 'act now', alternatives: ['respond soon', 'limited time', 'while available'], severity: 'high', category: 'urgency' },
  { word: 'urgent', alternatives: ['time-sensitive', 'important', 'priority'], severity: 'high', category: 'urgency' },
  { word: 'expires today', alternatives: ['limited availability', 'time-sensitive offer', 'available soon'], severity: 'high', category: 'urgency' },
  { word: 'last chance', alternatives: ['final opportunity', 'closing soon', 'limited time'], severity: 'high', category: 'urgency' },
  { word: 'hurry', alternatives: ['respond soon', 'limited time', 'act quickly'], severity: 'high', category: 'urgency' },
  { word: 'don\'t wait', alternatives: ['respond soon', 'act today', 'available now'], severity: 'high', category: 'urgency' },

  // Marketing/Sales (Medium Risk)
  { word: 'click here', alternatives: ['tap to learn more', 'visit our page', 'see details'], severity: 'medium', category: 'marketing' },
  { word: 'buy now', alternatives: ['get started', 'learn more', 'explore options'], severity: 'medium', category: 'marketing' },
  { word: 'limited time', alternatives: ['available soon', 'special opportunity', 'exclusive offer'], severity: 'medium', category: 'marketing' },
  { word: 'special promotion', alternatives: ['special offer', 'exclusive opportunity', 'limited availability'], severity: 'medium', category: 'marketing' },
  { word: 'discount', alternatives: ['savings', 'special pricing', 'reduced rate'], severity: 'medium', category: 'marketing' },
  { word: 'deal', alternatives: ['offer', 'opportunity', 'option'], severity: 'medium', category: 'marketing' },

  // Exaggeration (Medium Risk)
  { word: 'guaranteed', alternatives: ['confident', 'reliable', 'proven'], severity: 'medium', category: 'exaggeration' },
  { word: '100%', alternatives: ['fully', 'completely', 'entirely'], severity: 'medium', category: 'exaggeration' },
  { word: 'amazing', alternatives: ['great', 'excellent', 'valuable'], severity: 'medium', category: 'exaggeration' },
  { word: 'incredible', alternatives: ['excellent', 'outstanding', 'impressive'], severity: 'medium', category: 'exaggeration' },
  { word: 'unbelievable', alternatives: ['remarkable', 'impressive', 'notable'], severity: 'medium', category: 'exaggeration' },

  // Compliance/Legal (Low Risk)
  { word: 'no obligation', alternatives: ['no commitment required', 'risk-free', 'flexible'], severity: 'low', category: 'compliance' },
  { word: 'risk-free', alternatives: ['no commitment', 'flexible terms', 'easy to start'], severity: 'low', category: 'compliance' },
  { word: 'cancel anytime', alternatives: ['flexible terms', 'no long-term commitment', 'easy cancellation'], severity: 'low', category: 'compliance' },

  // Symbols/Special Characters
  { word: '!!!', alternatives: ['.', ''], severity: 'medium', category: 'formatting' },
  { word: '??', alternatives: ['?', ''], severity: 'low', category: 'formatting' },
];

// Create case-insensitive regex patterns
const spamPatterns = SPAM_WORDS.map(sw => ({
  ...sw,
  pattern: new RegExp(`\\b${sw.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
}));

/**
 * Detect spam words in a message
 */
export function detectSpam(message: string): SpamDetectionResult {
  const detectedWords: SpamDetectionResult['detectedWords'] = [];
  const suggestions: string[] = [];

  // Check each spam pattern
  spamPatterns.forEach(({ word, pattern, alternatives, severity, category }) => {
    const matches = message.matchAll(pattern);

    for (const match of matches) {
      if (match.index !== undefined) {
        detectedWords.push({
          word: match[0],
          position: match.index,
          severity,
          alternatives,
          category
        });

        // Add suggestion for replacement
        suggestions.push(
          `Replace "${match[0]}" with: ${alternatives.slice(0, 2).join(' or ')}`
        );
      }
    }
  });

  // Calculate spam score (0-100)
  const highSeverityCount = detectedWords.filter(w => w.severity === 'high').length;
  const mediumSeverityCount = detectedWords.filter(w => w.severity === 'medium').length;
  const lowSeverityCount = detectedWords.filter(w => w.severity === 'low').length;

  const spamScore = Math.min(100,
    (highSeverityCount * 30) +
    (mediumSeverityCount * 15) +
    (lowSeverityCount * 5)
  );

  const isSpammy = spamScore >= 30;

  return {
    isSpammy,
    spamScore,
    detectedWords,
    suggestions,
  };
}

/**
 * Auto-replace spam words with alternatives
 */
export function cleanMessage(message: string, useFirstAlternative: boolean = true): string {
  let cleaned = message;

  spamPatterns.forEach(({ pattern, alternatives }) => {
    if (alternatives.length > 0) {
      const replacement = useFirstAlternative ? alternatives[0] : alternatives[Math.floor(Math.random() * alternatives.length)];
      cleaned = cleaned.replace(pattern, replacement);
    }
  });

  // Clean up excessive punctuation
  cleaned = cleaned.replace(/!{2,}/g, '!');
  cleaned = cleaned.replace(/\?{2,}/g, '?');

  return cleaned;
}

/**
 * Get spam prevention tips
 */
export function getSpamPreventionTips(): string[] {
  return [
    'Avoid using all caps - it triggers spam filters',
    'Limit exclamation points to one per message',
    'Use conversational, natural language',
    'Avoid excessive urgency or pressure tactics',
    'Don\'t use too many links or shortened URLs',
    'Keep messages personalized and relevant',
    'Avoid financial claims without context',
    'Use proper grammar and spelling',
  ];
}

/**
 * Analyze message quality
 */
export function analyzeMessageQuality(message: string): {
  score: number;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check for all caps
  if (message === message.toUpperCase() && message.length > 10) {
    issues.push('Message is in all caps');
    recommendations.push('Use normal capitalization');
    score -= 20;
  }

  // Check for excessive punctuation
  const exclamationCount = (message.match(/!/g) || []).length;
  if (exclamationCount > 2) {
    issues.push('Too many exclamation points');
    recommendations.push('Limit to 1-2 exclamation points');
    score -= 10;
  }

  // Check message length
  if (message.length < 10) {
    issues.push('Message is too short');
    recommendations.push('Add more context to your message');
    score -= 15;
  } else if (message.length > 300) {
    issues.push('Message is very long');
    recommendations.push('Consider breaking into multiple messages');
    score -= 10;
  }

  // Check for spam words
  const spamResult = detectSpam(message);
  if (spamResult.isSpammy) {
    issues.push(`Contains ${spamResult.detectedWords.length} spam trigger words`);
    recommendations.push('Replace spam trigger words with alternatives');
    score -= spamResult.spamScore;
  }

  return {
    score: Math.max(0, score),
    issues,
    recommendations,
  };
}
