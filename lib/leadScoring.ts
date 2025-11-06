/**
 * Lead Scoring System
 * Calculates lead quality score (0-100) and temperature (hot/warm/cold)
 */

export interface LeadScore {
  score: number; // 0-100
  temperature: 'hot' | 'warm' | 'cold';
  breakdown: {
    engagement: number;
    responseRate: number;
    frequency: number;
    disposition: number;
  };
}

interface LeadData {
  disposition?: string | null;
  lastEngaged?: Date | string | null;
  responseRate?: number;
  totalSent?: number;
  totalReceived?: number;
  createdAt: Date | string;
}

/**
 * Calculate lead score based on engagement and behavior
 */
export function calculateLeadScore(lead: LeadData): LeadScore {
  let engagementScore = 0;
  let responseRateScore = 0;
  let frequencyScore = 0;
  let dispositionScore = 0;

  // 1. Recent Engagement (30 points)
  if (lead.lastEngaged) {
    const lastEngagedDate = new Date(lead.lastEngaged);
    const hoursSinceEngagement = (Date.now() - lastEngagedDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceEngagement < 24) {
      engagementScore = 30; // Engaged in last 24 hours
    } else if (hoursSinceEngagement < 168) { // 7 days
      engagementScore = 20;
    } else if (hoursSinceEngagement < 720) { // 30 days
      engagementScore = 10;
    } else {
      engagementScore = 0; // No recent engagement
    }
  }

  // 2. Response Rate (30 points)
  if (lead.responseRate !== undefined) {
    responseRateScore = Math.min(30, lead.responseRate * 30);
  }

  // 3. Message Frequency (20 points)
  const totalReceived = lead.totalReceived || 0;
  if (totalReceived > 5) {
    frequencyScore = 20;
  } else if (totalReceived > 2) {
    frequencyScore = 10;
  } else if (totalReceived > 0) {
    frequencyScore = 5;
  }

  // 4. Disposition (20 points)
  switch (lead.disposition?.toLowerCase()) {
    case 'qualified':
      dispositionScore = 20;
      break;
    case 'callback':
      dispositionScore = 15;
      break;
    case 'nurture':
      dispositionScore = 10;
      break;
    case 'sold':
      dispositionScore = 0; // Already converted
      break;
    case 'not_interested':
      dispositionScore = -50; // Negative score
      break;
    default:
      dispositionScore = 5; // Neutral/unknown
  }

  // Calculate total score
  const totalScore = Math.max(0, Math.min(100,
    engagementScore + responseRateScore + frequencyScore + dispositionScore
  ));

  // Determine temperature
  let temperature: 'hot' | 'warm' | 'cold';
  if (totalScore >= 70) {
    temperature = 'hot';
  } else if (totalScore >= 40) {
    temperature = 'warm';
  } else {
    temperature = 'cold';
  }

  return {
    score: Math.round(totalScore),
    temperature,
    breakdown: {
      engagement: engagementScore,
      responseRate: responseRateScore,
      frequency: frequencyScore,
      disposition: dispositionScore,
    },
  };
}

/**
 * Get temperature icon and color
 */
export function getTemperatureDisplay(temperature: 'hot' | 'warm' | 'cold') {
  switch (temperature) {
    case 'hot':
      return { icon: '🔥', color: 'text-red-500', bg: 'bg-red-500/10' };
    case 'warm':
      return { icon: '🌡️', color: 'text-orange-500', bg: 'bg-orange-500/10' };
    case 'cold':
      return { icon: '❄️', color: 'text-blue-400', bg: 'bg-blue-400/10' };
  }
}

/**
 * Update lead engagement metrics based on messages
 */
export function calculateEngagementMetrics(messages: Array<{ direction: string; sender: string }>) {
  const sent = messages.filter(m => m.direction === 'out').length;
  const received = messages.filter(m => m.direction === 'in' && m.sender === 'lead').length;
  const responseRate = sent > 0 ? received / sent : 0;

  // Find last engagement (last message from lead)
  const leadMessages = messages.filter(m => m.direction === 'in' && m.sender === 'lead');
  const lastEngaged = leadMessages.length > 0 ? new Date() : null; // Would use actual timestamp

  return {
    totalSent: sent,
    totalReceived: received,
    responseRate,
    lastEngaged,
  };
}
