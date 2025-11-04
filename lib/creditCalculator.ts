/**
 * Credit Cost Calculator for SMS Messages
 *
 * Pricing:
 * - 1-140 characters: 1 credit
 * - 141-280 characters: 2 credits
 * - 281+ characters: 3 credits
 * - Photos/Media: 6 credits per attachment
 */

export interface CreditCalculation {
  credits: number;
  segments: number;
  characterCount: number;
  hasMedia: boolean;
  mediaCount: number;
  breakdown: string;
}

/**
 * Calculate credit cost for an SMS message
 * @param message - The message text
 * @param mediaCount - Number of photos/media attachments (default: 0)
 * @returns Credit calculation breakdown
 */
export function calculateSMSCredits(
  message: string,
  mediaCount: number = 0
): CreditCalculation {
  const characterCount = message.length;
  let textCredits = 0;
  let segments = 0;

  // Calculate text credits based on character count
  if (characterCount === 0) {
    textCredits = 0;
    segments = 0;
  } else if (characterCount <= 140) {
    textCredits = 1;
    segments = 1;
  } else if (characterCount <= 280) {
    textCredits = 2;
    segments = 2;
  } else {
    textCredits = 3;
    segments = 3;
  }

  // Calculate media credits (6 credits per photo)
  const mediaCredits = mediaCount * 6;

  // Total credits
  const totalCredits = textCredits + mediaCredits;

  // Build breakdown string
  const breakdownParts: string[] = [];
  if (textCredits > 0) {
    breakdownParts.push(`${textCredits} credit${textCredits !== 1 ? 's' : ''} (${characterCount} chars, ${segments} segment${segments !== 1 ? 's' : ''})`);
  }
  if (mediaCredits > 0) {
    breakdownParts.push(`${mediaCredits} credit${mediaCredits !== 1 ? 's' : ''} (${mediaCount} photo${mediaCount !== 1 ? 's' : ''})`);
  }

  return {
    credits: totalCredits,
    segments,
    characterCount,
    hasMedia: mediaCount > 0,
    mediaCount,
    breakdown: breakdownParts.join(' + ') || '0 credits'
  };
}

/**
 * Get the character limit warning threshold
 * Returns the next segment boundary
 */
export function getCharacterWarning(currentLength: number): {
  threshold: number;
  remaining: number;
  nextSegmentCost: number;
} {
  if (currentLength <= 140) {
    return {
      threshold: 140,
      remaining: 140 - currentLength,
      nextSegmentCost: 2
    };
  } else if (currentLength <= 280) {
    return {
      threshold: 280,
      remaining: 280 - currentLength,
      nextSegmentCost: 3
    };
  } else {
    return {
      threshold: 280,
      remaining: 0,
      nextSegmentCost: 3
    };
  }
}

/**
 * Estimate campaign cost based on message and lead count
 */
export function estimateCampaignCost(
  message: string,
  leadCount: number,
  mediaCount: number = 0
): {
  creditsPerMessage: number;
  totalCredits: number;
  totalLeads: number;
  breakdown: string;
} {
  const perMessage = calculateSMSCredits(message, mediaCount);
  const totalCredits = perMessage.credits * leadCount;

  return {
    creditsPerMessage: perMessage.credits,
    totalCredits,
    totalLeads: leadCount,
    breakdown: `${leadCount} leads × ${perMessage.credits} credits = ${totalCredits} total credits`
  };
}
