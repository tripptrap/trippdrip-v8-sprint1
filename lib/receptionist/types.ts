// TypeScript interfaces for Receptionist Mode

/**
 * Structured identity fields — the AI uses these to answer
 * "who are you?", "who do you work for?", "what do you want?" etc.
 */
export interface ReceptionistIdentity {
  /**
   * The account's industry, filled from its signup answer when the operator has
   * not set an identity of their own. Exists so the AI never asks a contact what
   * kind of business it is — it works there.
   */
  industryContext?: string;
  agentName?: string;       // Name the AI introduces itself as
  businessName?: string;    // Company / agency name
  whatYouOffer?: string;    // One-liner: what product/service you sell
  targetAudience?: string;  // Who you help (e.g. "homeowners in Texas")
  serviceArea?: string;     // Geography you serve
  callbackPhone?: string;   // Phone number to give out if they want to call
  website?: string;         // Website URL
  tagline?: string;         // Short pitch / value prop
}

export interface ReceptionistSettings {
  id: string;
  user_id: string;

  // Enable/Disable
  enabled: boolean;

  // Identity — who the AI says it is
  identity: ReceptionistIdentity;

  // AI Configuration
  system_prompt: string | null;
  greeting_message: string | null;
  industry: string | null; // Industry for preset tone selection
  use_industry_preset: boolean; // Use industry preset vs custom prompt

  // Business Hours
  business_hours_enabled: boolean;
  business_hours_start: string; // TIME format "HH:MM:SS"
  business_hours_end: string;
  business_hours_timezone: string;
  business_days: number[]; // 1=Mon, 7=Sun
  after_hours_message: string | null;

  // Response Settings
  respond_to_sold_clients: boolean;
  respond_to_new_contacts: boolean;
  auto_create_leads: boolean;

  // Calendar
  calendar_enabled: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface ReceptionistSettingsInput {
  enabled?: boolean;
  identity?: ReceptionistIdentity;
  system_prompt?: string | null;
  greeting_message?: string | null;
  industry?: string | null;
  use_industry_preset?: boolean;
  business_hours_enabled?: boolean;
  business_hours_start?: string;
  business_hours_end?: string;
  business_hours_timezone?: string;
  business_days?: number[];
  after_hours_message?: string | null;
  respond_to_sold_clients?: boolean;
  respond_to_new_contacts?: boolean;
  auto_create_leads?: boolean;
  calendar_enabled?: boolean;
}

export interface ReceptionistLog {
  id: string;
  user_id: string;
  thread_id: string | null;
  lead_id: string | null;
  phone_number: string;
  contact_type: ContactType;
  inbound_message: string;
  ai_response: string;
  response_type: ResponseType;
  points_used: number;
  created_at: string;
}

export type ContactType = 'sold_client' | 'new_contact' | 'existing_lead';

export type ResponseType = 'greeting' | 'support' | 'scheduling' | 'after_hours' | 'error';

export interface ReceptionistTriggerParams {
  userId: string;
  phoneNumber: string;
  leadStatus?: string | null;
  leadDisposition?: string | null;
  isNewContact: boolean;
}

export interface ReceptionistTriggerResult {
  shouldTrigger: boolean;
  contactType: ContactType;
  reason: string;
  settings?: ReceptionistSettings;
}

export interface FlowQuestion {
  question: string;
  fieldName: string;
}

/** A single flow step — backed 1:1 by a row in `tags` (flow_id + flow_step_order). */
export interface FlowStep {
  tagId: string;
  tagName: string;          // also the pipeline-stage label shown in tags/dashboard
  aiInstruction: string;    // what the AI should ask/say while this is the current step
  fieldName: string;        // key this step writes into leads.conversation_state.collectedInfo
  completed: boolean;
}

export interface FlowContext {
  flowName: string;
  steps: FlowStep[];                        // full ordered step list, for continuity/tone
  collectedInfo: Record<string, string>;    // fieldName → value already gathered
  currentStep: FlowStep | null;             // step the lead is currently on; null once allAnswered
  allAnswered: boolean;
}

export interface ReceptionistResponseParams {
  userId: string;
  threadId: string;
  phoneNumber: string;
  inboundMessage: string;
  contactType: ContactType;
  leadId?: string | null;
  leadName?: string | null;
  conversationHistory?: Array<{ direction: string; body: string }>;
  flowContext?: FlowContext | null;          // present when lead has an active flow
}

export interface ReceptionistResponseResult {
  success: boolean;
  response?: string;
  responseType?: ResponseType;
  error?: string;
  pointsUsed?: number;
}

export interface BusinessHoursCheckResult {
  isOpen: boolean;
  reason: string;
  nextOpenTime?: string;
}

// Default settings for new users
export const DEFAULT_RECEPTIONIST_SETTINGS: Omit<ReceptionistSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  enabled: false,
  identity: {},
  system_prompt: null,
  greeting_message: 'Hi! Thanks for reaching out. How can I help you today?',
  industry: null,
  use_industry_preset: true,
  business_hours_enabled: true,
  business_hours_start: '09:00:00',
  business_hours_end: '17:00:00',
  business_hours_timezone: 'America/New_York',
  business_days: [1, 2, 3, 4, 5], // Mon-Fri
  after_hours_message: "Thanks for reaching out! We're currently closed but will get back to you during business hours.",
  respond_to_sold_clients: true,
  respond_to_new_contacts: true,
  auto_create_leads: true,
  calendar_enabled: false,
};

// Default system prompt template
export const DEFAULT_SYSTEM_PROMPT = `You are a friendly, professional receptionist.

YOUR ROLE:
- Answer customer questions about the business
- Help schedule appointments when requested
- Provide helpful information
- Collect contact details from new inquiries

RULES:
- Keep responses concise (under 160 characters when possible)
- Be warm and professional
- If you can't help with something, offer to have someone call them back
- Never make up information you don't have
- Ask clarifying questions when needed`;
