// AI Response Quality Helper
// Validates and improves AI-generated responses

export interface ResponseQualityCheck {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  confidence: number; // 0-100
}

export interface ResponseImprovement {
  original: string;
  improved: string;
  changes: string[];
}

/**
 * Check if AI response is too short or generic
 */
export function checkResponseLength(response: string): boolean {
  const trimmed = response.trim();
  return trimmed.length >= 10 && trimmed.length <= 500;
}

/**
 * Detect if AI is confused or asking clarifying questions when it shouldn't
 */
export function detectConfusion(response: string): boolean {
  const confusionPatterns = [
    /I don't understand/i,
    /I'm not sure what you mean/i,
    /Could you clarify/i,
    /I'm confused/i,
    /What do you mean by/i,
    /I need more information about/i,
  ];

  return confusionPatterns.some(pattern => pattern.test(response));
}

/**
 * Detect if AI is being too apologetic or uncertain
 */
export function detectUncertainty(response: string): boolean {
  const uncertaintyPatterns = [
    /I apologize/i,
    /I'm sorry/i,
    /Unfortunately/i,
    /I might be wrong/i,
    /I think maybe/i,
    /Perhaps/i,
  ];

  const matches = uncertaintyPatterns.filter(pattern => pattern.test(response));
  // Allow 1 apology, but more than that is excessive
  return matches.length > 1;
}

/**
 * Detect if AI is trying to show calendar times when it shouldn't
 */
export function detectPrematureCalendarMention(
  response: string,
  allQuestionsAnswered: boolean
): boolean {
  if (allQuestionsAnswered) return false;

  const calendarPatterns = [
    /available times/i,
    /schedule.*appointment/i,
    /book.*call/i,
    /calendar/i,
    /time slot/i,
  ];

  return calendarPatterns.some(pattern => pattern.test(response));
}

/**
 * Detect if AI is asking multiple questions at once (should ask one at a time)
 */
export function detectMultipleQuestions(response: string): boolean {
  // Count question marks
  const questionMarks = (response.match(/\?/g) || []).length;

  // Also check for "and" connecting questions
  const hasMultipleQuestionsPattern = /\?\s+(And|Also|Additionally)/i.test(response);

  return questionMarks > 1 || hasMultipleQuestionsPattern;
}

/**
 * Comprehensive quality check
 */
export function checkResponseQuality(
  response: string,
  context: {
    allQuestionsAnswered: boolean;
    requiredQuestions: any[];
    collectedFieldsCount: number;
  }
): ResponseQualityCheck {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let confidence = 100;

  // Check length
  if (!checkResponseLength(response)) {
    issues.push('Response length is not optimal');
    suggestions.push('Response should be between 10-500 characters');
    confidence -= 20;
  }

  // Check for confusion
  if (detectConfusion(response)) {
    issues.push('AI appears confused');
    suggestions.push('Provide clearer context to the AI');
    confidence -= 30;
  }

  // Check for excessive uncertainty
  if (detectUncertainty(response)) {
    issues.push('AI is being too apologetic or uncertain');
    suggestions.push('Make AI more confident in its responses');
    confidence -= 15;
  }

  // Check for premature calendar mention
  if (detectPrematureCalendarMention(response, context.allQuestionsAnswered)) {
    issues.push('AI is mentioning calendar before all questions answered');
    suggestions.push('Ensure AI asks all required questions first');
    confidence -= 25;
  }

  // Check for multiple questions
  if (detectMultipleQuestions(response)) {
    issues.push('AI is asking multiple questions at once');
    suggestions.push('AI should ask one question at a time');
    confidence -= 10;
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions,
    confidence: Math.max(0, confidence),
  };
}

/**
 * Improve response by removing common issues
 */
export function improveResponse(response: string): ResponseImprovement {
  let improved = response;
  const changes: string[] = [];

  // Remove excessive apologies (keep first one only)
  const apologiesCount = (improved.match(/I apologize|I'm sorry/gi) || []).length;
  if (apologiesCount > 1) {
    // Remove all but the first apology
    let count = 0;
    improved = improved.replace(/I apologize|I'm sorry/gi, (match) => {
      count++;
      return count === 1 ? match : '';
    });
    changes.push('Removed excessive apologies');
  }

  // Remove filler words
  const fillerWords = [
    { pattern: /\s+perhaps\s+/gi, replacement: ' ' },
    { pattern: /\s+maybe\s+/gi, replacement: ' ' },
    { pattern: /\s+I think\s+/gi, replacement: ' ' },
    { pattern: /\s+kind of\s+/gi, replacement: ' ' },
    { pattern: /\s+sort of\s+/gi, replacement: ' ' },
  ];

  fillerWords.forEach(({ pattern, replacement }) => {
    const before = improved;
    improved = improved.replace(pattern, replacement);
    if (before !== improved) {
      changes.push(`Removed filler word: ${pattern.source}`);
    }
  });

  // Clean up extra whitespace
  improved = improved.replace(/\s+/g, ' ').trim();

  // Ensure proper sentence ending
  if (improved && !improved.endsWith('.') && !improved.endsWith('?') && !improved.endsWith('!')) {
    improved += '.';
    changes.push('Added proper sentence ending');
  }

  return {
    original: response,
    improved,
    changes,
  };
}

/**
 * Generate a fallback response when AI fails
 */
export function generateFallbackResponse(context: {
  allQuestionsAnswered: boolean;
  requiredQuestions: any[];
  collectedFieldsCount: number;
  currentStep?: any;
}): string {
  const { allQuestionsAnswered, requiredQuestions, collectedFieldsCount } = context;

  if (!allQuestionsAnswered && requiredQuestions.length > 0) {
    const nextQuestion = requiredQuestions[collectedFieldsCount];
    if (nextQuestion) {
      return `Great! ${nextQuestion.question}`;
    }
  }

  return "I'm here to help you find the best option. Let me ask you a few quick questions to get started.";
}

/**
 * Validate and potentially fix the AI response
 */
export function validateAndFixResponse(
  response: string,
  context: {
    allQuestionsAnswered: boolean;
    requiredQuestions: any[];
    collectedFieldsCount: number;
  }
): { response: string; wasFixed: boolean; issues: string[] } {
  // Check quality
  const qualityCheck = checkResponseQuality(response, context);

  // If quality is too low, try to improve
  if (qualityCheck.confidence < 50) {
    const improved = improveResponse(response);

    // Re-check improved version
    const recheck = checkResponseQuality(improved.improved, context);

    if (recheck.confidence > qualityCheck.confidence) {
      return {
        response: improved.improved,
        wasFixed: true,
        issues: qualityCheck.issues,
      };
    }

    // If improvement didn't help much, use fallback
    if (recheck.confidence < 50) {
      return {
        response: generateFallbackResponse(context),
        wasFixed: true,
        issues: [...qualityCheck.issues, 'Used fallback response'],
      };
    }
  }

  // Response is good enough
  return {
    response,
    wasFixed: false,
    issues: qualityCheck.issues,
  };
}

/**
 * Log quality metrics for monitoring
 */
export function logQualityMetrics(
  response: string,
  context: any,
  wasFixed: boolean
): void {
  const quality = checkResponseQuality(response, context);

  console.log('📊 AI Response Quality Metrics:', {
    confidence: quality.confidence,
    isValid: quality.isValid,
    issuesCount: quality.issues.length,
    wasFixed,
    responseLength: response.length,
  });

  if (quality.issues.length > 0) {
    console.log('⚠️ Quality Issues:', quality.issues);
  }

  if (quality.suggestions.length > 0) {
    console.log('💡 Suggestions:', quality.suggestions);
  }
}
