// Spam Risk Detection System

export type SpamRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type SpamCheckResult = {
  level: SpamRiskLevel;
  score: number; // 0-100
  flags: string[];
  blocked: boolean;
  recommendations: string[];
};

// Analyze a message for spam indicators
export function checkSpamRisk(message: string, recipientCount: number = 1): SpamCheckResult {
  const flags: string[] = [];
  let score = 0;

  // Check message length
  if (message.length < 10) {
    flags.push('Message too short');
    score += 15;
  }

  // Check for excessive caps
  const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
  if (capsRatio > 0.5 && message.length > 20) {
    flags.push('Excessive capitalization');
    score += 20;
  }

  // Check for spam keywords
  const spamKeywords = [
    'free money', 'click here', 'act now', 'limited time',
    'congratulations', 'you won', 'claim now', 'urgent',
    'winner', 'prize', 'cash', 'bitcoin', 'crypto',
    'investment opportunity', 'double your', 'make money fast'
  ];

  const lowerMessage = message.toLowerCase();
  const foundSpamKeywords = spamKeywords.filter(keyword =>
    lowerMessage.includes(keyword)
  );

  if (foundSpamKeywords.length > 0) {
    flags.push(`Contains spam keywords: ${foundSpamKeywords.join(', ')}`);
    score += foundSpamKeywords.length * 15;
  }

  // Check for excessive links
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const links = message.match(urlPattern) || [];
  if (links.length > 2) {
    flags.push('Too many links');
    score += 25;
  }

  // Check for suspicious patterns
  if (/\$\$+|\!\!\!+/.test(message)) {
    flags.push('Suspicious punctuation patterns');
    score += 10;
  }

  // Check recipient count (mass messaging)
  if (recipientCount > 100) {
    flags.push('High volume sending (>100 recipients)');
    score += 20;
  } else if (recipientCount > 50) {
    flags.push('Medium volume sending (>50 recipients)');
    score += 10;
  }

  // Check for repeated characters
  if (/(.)\1{4,}/.test(message)) {
    flags.push('Repeated characters detected');
    score += 10;
  }

  // Determine risk level
  let level: SpamRiskLevel;
  let blocked = false;
  const recommendations: string[] = [];

  if (score >= 70) {
    level = 'critical';
    blocked = true;
    recommendations.push('Message blocked - high spam score');
    recommendations.push('Remove spam keywords and reduce links');
    recommendations.push('Use more natural language');
  } else if (score >= 50) {
    level = 'high';
    blocked = false;
    recommendations.push('High spam risk - deliverability may be affected');
    recommendations.push('Consider rewording your message');
    recommendations.push('Reduce capitalization and exclamation marks');
  } else if (score >= 30) {
    level = 'medium';
    blocked = false;
    recommendations.push('Medium spam risk detected');
    recommendations.push('Review message for spam triggers');
  } else {
    level = 'low';
    blocked = false;
    recommendations.push('Message looks good');
  }

  return {
    level,
    score,
    flags,
    blocked,
    recommendations
  };
}

// Check sending velocity (rate limiting)
export function checkSendingVelocity(): {
  allowed: boolean;
  messagesInLastHour: number;
  messagesInLastDay: number;
  hourlyLimit: number;
  dailyLimit: number;
  recommendation: string;
} {
  if (typeof window === 'undefined') {
    return {
      allowed: true,
      messagesInLastHour: 0,
      messagesInLastDay: 0,
      hourlyLimit: 100,
      dailyLimit: 1000,
      recommendation: 'Server-side check required'
    };
  }

  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const oneDayAgo = now - (24 * 60 * 60 * 1000);

  // Get sending history from localStorage
  const historyKey = 'sendingHistory';
  const rawHistory = localStorage.getItem(historyKey);
  const history: number[] = rawHistory ? JSON.parse(rawHistory) : [];

  // Clean old entries
  const cleanedHistory = history.filter(timestamp => timestamp > oneDayAgo);

  // Count messages
  const messagesInLastHour = cleanedHistory.filter(t => t > oneHourAgo).length;
  const messagesInLastDay = cleanedHistory.length;

  // Limits
  const hourlyLimit = 100;
  const dailyLimit = 1000;

  const allowed = messagesInLastHour < hourlyLimit && messagesInLastDay < dailyLimit;

  let recommendation = '';
  if (!allowed) {
    if (messagesInLastHour >= hourlyLimit) {
      recommendation = `Hourly limit reached (${hourlyLimit}). Please wait.`;
    } else if (messagesInLastDay >= dailyLimit) {
      recommendation = `Daily limit reached (${dailyLimit}). Try again tomorrow.`;
    }
  }

  return {
    allowed,
    messagesInLastHour,
    messagesInLastDay,
    hourlyLimit,
    dailyLimit,
    recommendation
  };
}

// Record a message send
export function recordMessageSent(): void {
  if (typeof window === 'undefined') return;

  const historyKey = 'sendingHistory';
  const rawHistory = localStorage.getItem(historyKey);
  const history: number[] = rawHistory ? JSON.parse(rawHistory) : [];

  history.push(Date.now());

  // Keep only last 24 hours
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const cleanedHistory = history.filter(timestamp => timestamp > oneDayAgo);

  localStorage.setItem(historyKey, JSON.stringify(cleanedHistory));
}

// Get spam risk color for UI
export function getSpamRiskColor(level: SpamRiskLevel): string {
  switch (level) {
    case 'low': return 'green';
    case 'medium': return 'yellow';
    case 'high': return 'orange';
    case 'critical': return 'red';
  }
}
