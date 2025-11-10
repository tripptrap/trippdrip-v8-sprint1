// Conversation Session Manager
// Handles lead tracking, session persistence, and recovery

import { createClient } from "@/lib/supabase/server";

export interface SessionData {
  sessionId?: string;
  leadId?: string;
  flowId: string;
  collectedInfo: any;
  conversationHistory: any[];
  currentStep?: any;
}

/**
 * Create or update a lead from collected conversation info
 */
export async function upsertLeadFromConversation(
  userId: string,
  collectedInfo: any,
  flowId: string
): Promise<{leadId: string | null, error: any}> {
  try {
    const supabase = await createClient();

    // Extract lead fields from collected info
    const leadData: any = {
      user_id: userId,
      source: 'conversation_flow',
      flow_id: flowId,
      status: 'new',
      conversation_state: {
        collectedInfo,
        lastUpdated: new Date().toISOString()
      }
    };

    // Map common fields
    if (collectedInfo.name) {
      const nameParts = String(collectedInfo.name).split(' ');
      leadData.first_name = nameParts[0];
      leadData.last_name = nameParts.slice(1).join(' ') || null;
    }
    if (collectedInfo.firstName) leadData.first_name = collectedInfo.firstName;
    if (collectedInfo.lastName) leadData.last_name = collectedInfo.lastName;
    if (collectedInfo.email) leadData.email = collectedInfo.email;
    if (collectedInfo.phone) leadData.phone = collectedInfo.phone;
    if (collectedInfo.company) leadData.company = collectedInfo.company;
    if (collectedInfo.zipCode) leadData.state = collectedInfo.zipCode;

    // Try to find existing lead by email or phone
    let existingLead = null;
    if (leadData.email) {
      const { data } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('email', leadData.email)
        .single();
      existingLead = data;
    } else if (leadData.phone) {
      const { data } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .eq('phone', leadData.phone)
        .single();
      existingLead = data;
    }

    if (existingLead) {
      // Update existing lead
      const { data, error } = await supabase
        .from('leads')
        .update({
          ...leadData,
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingLead.id)
        .select('id')
        .single();

      return { leadId: data?.id || null, error };
    } else {
      // Create new lead
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...leadData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();

      return { leadId: data?.id || null, error };
    }
  } catch (error) {
    console.error('Error upserting lead:', error);
    return { leadId: null, error };
  }
}

/**
 * Create a new conversation session
 */
export async function createSession(
  userId: string,
  sessionData: SessionData
): Promise<{sessionId: string | null, error: any}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('conversation_sessions')
      .insert({
        user_id: userId,
        lead_id: sessionData.leadId,
        flow_id: sessionData.flowId,
        status: 'active',
        collected_info: sessionData.collectedInfo || {},
        conversation_history: sessionData.conversationHistory || [],
        current_step: sessionData.currentStep,
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .select('id')
      .single();

    return { sessionId: data?.id || null, error };
  } catch (error) {
    console.error('Error creating session:', error);
    return { sessionId: null, error };
  }
}

/**
 * Update an existing conversation session
 */
export async function updateSession(
  userId: string,
  sessionId: string,
  updates: Partial<SessionData>
): Promise<{success: boolean, error: any}> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('conversation_sessions')
      .update({
        ...updates,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', userId);

    return { success: !error, error };
  } catch (error) {
    console.error('Error updating session:', error);
    return { success: false, error };
  }
}

/**
 * Mark session as completed
 */
export async function completeSession(
  userId: string,
  sessionId: string,
  appointmentBooked: boolean = false,
  appointmentTime?: string,
  googleEventId?: string
): Promise<{success: boolean, error: any}> {
  try {
    const supabase = await createClient();

    const updates: any = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      appointment_booked: appointmentBooked
    };

    if (appointmentTime) updates.appointment_time = appointmentTime;
    if (googleEventId) updates.google_event_id = googleEventId;

    const { error } = await supabase
      .from('conversation_sessions')
      .update(updates)
      .eq('id', sessionId)
      .eq('user_id', userId);

    return { success: !error, error };
  } catch (error) {
    console.error('Error completing session:', error);
    return { success: false, error };
  }
}

/**
 * Track lead activity
 */
export async function trackLeadActivity(
  userId: string,
  leadId: string,
  activityType: string,
  description: string,
  metadata?: any
): Promise<{success: boolean, error: any}> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('lead_activities')
      .insert({
        user_id: userId,
        lead_id: leadId,
        activity_type: activityType,
        description,
        metadata: metadata || {},
        created_at: new Date().toISOString()
      });

    return { success: !error, error };
  } catch (error) {
    console.error('Error tracking activity:', error);
    return { success: false, error };
  }
}

/**
 * Check for abandoned sessions (for recovery)
 */
export async function getAbandonedSessions(
  userId: string,
  hoursInactive: number = 1
): Promise<any[]> {
  try {
    const supabase = await createClient();
    const cutoffTime = new Date(Date.now() - hoursInactive * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('conversation_sessions')
      .select('*, leads(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .lt('last_activity_at', cutoffTime);

    if (error) {
      console.error('Error fetching abandoned sessions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAbandonedSessions:', error);
    return [];
  }
}
