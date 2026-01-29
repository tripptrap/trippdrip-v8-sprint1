// TypeScript interfaces for Receptionist Mode

export interface ReceptionistSettings {
  id: string;
  user_id: string;

  // Enable/Disable
  enabled: boolean;

  // AI Configuration
  system_prompt: string | null;
  greeting_message: string | null;

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
  system_prompt?: string | null;
  greeting_message?: string | null;
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

export interface ReceptionistResponseParams {
  userId: string;
  threadId: string;
  phoneNumber: string;
  inboundMessage: string;
  contactType: ContactType;
  leadId?: string | null;
  leadName?: string | null;
  conversationHistory?: Array<{ direction: string; body: string }>;
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
  system_prompt: null,
  greeting_message: 'Hi! Thanks for reaching out. How can I help you today?',
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
