// AI Response Templates
// Pre-built responses for common scenarios to ensure consistency

export interface ResponseTemplate {
  id: string;
  scenario: string;
  template: string;
  variables?: string[];
  priority?: number;
}

export interface TemplateContext {
  userName?: string;
  productName?: string;
  serviceName?: string;
  nextStep?: string;
  timeframe?: string;
  [key: string]: any;
}

/**
 * Greeting Templates
 */
export const greetingTemplates: ResponseTemplate[] = [
  {
    id: 'greeting_initial',
    scenario: 'First message to user',
    template: "Hi {userName}! I'm here to help you find the perfect solution. Let me ask you a few quick questions to get started.",
    variables: ['userName'],
    priority: 10
  },
  {
    id: 'greeting_returning',
    scenario: 'Returning user',
    template: "Welcome back, {userName}! Ready to continue where we left off?",
    variables: ['userName'],
    priority: 9
  }
];

/**
 * Question Templates
 */
export const questionTemplates: ResponseTemplate[] = [
  {
    id: 'ask_name',
    scenario: 'Asking for user name',
    template: "Great! What's your name?",
    priority: 10
  },
  {
    id: 'ask_email',
    scenario: 'Asking for email',
    template: "Perfect! What's the best email to reach you at?",
    priority: 10
  },
  {
    id: 'ask_phone',
    scenario: 'Asking for phone number',
    template: "And what's your phone number so we can give you a call?",
    priority: 10
  },
  {
    id: 'ask_budget',
    scenario: 'Asking about budget',
    template: "What budget range are you working with for this?",
    priority: 8
  },
  {
    id: 'ask_timeline',
    scenario: 'Asking about timeline',
    template: "When are you looking to get started?",
    priority: 8
  }
];

/**
 * Confirmation Templates
 */
export const confirmationTemplates: ResponseTemplate[] = [
  {
    id: 'confirm_info',
    scenario: 'Confirming collected information',
    template: "Perfect! Let me make sure I have everything correct.",
    priority: 9
  },
  {
    id: 'confirm_next_steps',
    scenario: 'Confirming next steps',
    template: "Great! Here's what happens next: {nextStep}",
    variables: ['nextStep'],
    priority: 8
  }
];

/**
 * Calendar/Booking Templates
 */
export const calendarTemplates: ResponseTemplate[] = [
  {
    id: 'show_calendar',
    scenario: 'Showing calendar availability',
    template: "Perfect! I've found some great times for us to connect. When works best for you?",
    priority: 10
  },
  {
    id: 'booking_confirmed',
    scenario: 'Appointment booked successfully',
    template: "Excellent! I've scheduled our call for {appointmentTime}. You'll receive a confirmation shortly.",
    variables: ['appointmentTime'],
    priority: 10
  },
  {
    id: 'booking_error',
    scenario: 'Error booking appointment',
    template: "I'm having trouble booking that time. Let me show you some other options.",
    priority: 9
  }
];

/**
 * Error Handling Templates
 */
export const errorTemplates: ResponseTemplate[] = [
  {
    id: 'invalid_email',
    scenario: 'Invalid email format',
    template: "That doesn't look like a valid email address. Could you check and provide it again?",
    priority: 10
  },
  {
    id: 'invalid_phone',
    scenario: 'Invalid phone format',
    template: "That phone number doesn't look quite right. Can you provide it in a standard format?",
    priority: 10
  },
  {
    id: 'missing_info',
    scenario: 'Missing required information',
    template: "I still need a bit more information to help you best.",
    priority: 8
  },
  {
    id: 'technical_error',
    scenario: 'System error occurred',
    template: "I'm experiencing a technical issue. Give me just a moment to get this sorted.",
    priority: 10
  }
];

/**
 * Acknowledgment Templates
 */
export const acknowledgmentTemplates: ResponseTemplate[] = [
  {
    id: 'ack_enthusiastic',
    scenario: 'Enthusiastic acknowledgment',
    template: "Awesome! That's exactly what I needed.",
    priority: 7
  },
  {
    id: 'ack_neutral',
    scenario: 'Neutral acknowledgment',
    template: "Got it, thanks!",
    priority: 6
  },
  {
    id: 'ack_understanding',
    scenario: 'Understanding acknowledgment',
    template: "I understand. Let me work with that.",
    priority: 7
  }
];

/**
 * Transition Templates
 */
export const transitionTemplates: ResponseTemplate[] = [
  {
    id: 'transition_next_question',
    scenario: 'Moving to next question',
    template: "Perfect! Now, {nextQuestion}",
    variables: ['nextQuestion'],
    priority: 8
  },
  {
    id: 'transition_almost_done',
    scenario: 'Almost done collecting info',
    template: "Almost done! Just one more thing.",
    priority: 9
  },
  {
    id: 'transition_to_calendar',
    scenario: 'Transitioning to calendar',
    template: "Great! I have everything I need. Let's find a time to connect.",
    priority: 10
  }
];

/**
 * Fallback Templates
 */
export const fallbackTemplates: ResponseTemplate[] = [
  {
    id: 'fallback_generic',
    scenario: 'Generic fallback',
    template: "I'm here to help you find the right solution. Let me ask you a few questions.",
    priority: 5
  },
  {
    id: 'fallback_confused',
    scenario: 'User seems confused',
    template: "Let me clarify. I'm here to help match you with the best option.",
    priority: 6
  },
  {
    id: 'fallback_off_topic',
    scenario: 'User went off topic',
    template: "That's interesting! But to help you best, let me ask: {relevantQuestion}",
    variables: ['relevantQuestion'],
    priority: 7
  }
];

/**
 * All templates combined
 */
export const allTemplates: ResponseTemplate[] = [
  ...greetingTemplates,
  ...questionTemplates,
  ...confirmationTemplates,
  ...calendarTemplates,
  ...errorTemplates,
  ...acknowledgmentTemplates,
  ...transitionTemplates,
  ...fallbackTemplates
];

/**
 * Find template by ID
 */
export function getTemplateById(id: string): ResponseTemplate | undefined {
  return allTemplates.find(t => t.id === id);
}

/**
 * Find templates by scenario
 */
export function getTemplatesByScenario(scenario: string): ResponseTemplate[] {
  return allTemplates
    .filter(t => t.scenario.toLowerCase().includes(scenario.toLowerCase()))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Fill template with variables
 */
export function fillTemplate(template: string, context: TemplateContext): string {
  let filled = template;

  // Replace {variable} with context values
  Object.keys(context).forEach(key => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    filled = filled.replace(regex, String(context[key] || ''));
  });

  // Remove any remaining unfilled variables
  filled = filled.replace(/\{[^}]+\}/g, '');

  // Clean up extra spaces
  filled = filled.replace(/\s+/g, ' ').trim();

  return filled;
}

/**
 * Render template with context
 */
export function renderTemplate(templateId: string, context: TemplateContext = {}): string {
  const template = getTemplateById(templateId);

  if (!template) {
    console.warn(`Template not found: ${templateId}`);
    return '';
  }

  return fillTemplate(template.template, context);
}

/**
 * Get best template for scenario
 */
export function getBestTemplateForScenario(
  scenario: string,
  context: TemplateContext = {}
): string {
  const templates = getTemplatesByScenario(scenario);

  if (templates.length === 0) {
    console.warn(`No templates found for scenario: ${scenario}`);
    return '';
  }

  // Return highest priority template
  return fillTemplate(templates[0].template, context);
}

/**
 * Detect scenario from conversation state
 */
export function detectScenario(context: {
  allQuestionsAnswered: boolean;
  requiredQuestions: any[];
  collectedFieldsCount: number;
  currentField?: string;
  hasError?: boolean;
  errorType?: string;
}): string {
  // Error scenarios
  if (context.hasError) {
    if (context.errorType === 'invalid_email') return 'invalid_email';
    if (context.errorType === 'invalid_phone') return 'invalid_phone';
    return 'technical_error';
  }

  // Calendar/booking scenarios
  if (context.allQuestionsAnswered) {
    return 'show_calendar';
  }

  // Question scenarios
  if (context.currentField) {
    const field = context.currentField.toLowerCase();
    if (field.includes('name')) return 'ask_name';
    if (field.includes('email')) return 'ask_email';
    if (field.includes('phone')) return 'ask_phone';
    if (field.includes('budget')) return 'ask_budget';
    if (field.includes('timeline') || field.includes('when')) return 'ask_timeline';
  }

  // Progress scenarios
  const progress = context.collectedFieldsCount / Math.max(context.requiredQuestions.length, 1);
  if (progress > 0.8) return 'almost_done';
  if (progress > 0) return 'next_question';

  // Initial scenario
  if (context.collectedFieldsCount === 0) {
    return 'first message';
  }

  return 'generic';
}

/**
 * Generate response using templates
 */
export function generateTemplatedResponse(context: {
  allQuestionsAnswered: boolean;
  requiredQuestions: any[];
  collectedFieldsCount: number;
  currentField?: string;
  hasError?: boolean;
  errorType?: string;
  userName?: string;
  nextQuestion?: string;
  nextStep?: string;
}): string {
  const scenario = detectScenario(context);

  const templateContext: TemplateContext = {
    userName: context.userName || 'there',
    nextQuestion: context.nextQuestion,
    nextStep: context.nextStep
  };

  return getBestTemplateForScenario(scenario, templateContext);
}
