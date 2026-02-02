// Subscription Features and Benefits System
import { createClient } from "@/lib/supabase/client";

export type SubscriptionTier = 'unpaid' | 'growth' | 'scale';

export interface SubscriptionFeatures {
  // Core Benefits
  monthlyCredits: number;
  price: number;

  // Contact & Lead Limits
  maxContacts: number;
  maxCampaigns: number;
  maxFlows: number;
  maxTemplates: number;

  // AI Features
  aiResponses: boolean;
  aiFlowGeneration: boolean;
  aiDocumentProcessing: boolean;
  advancedAI: boolean; // GPT-4, advanced models

  // Messaging Features
  bulkMessaging: boolean;
  scheduledMessages: boolean;
  automatedFollowUps: boolean;
  emailIntegration: boolean;

  // Analytics & Reporting
  basicAnalytics: boolean;
  advancedAnalytics: boolean;
  customReports: boolean;
  exportData: boolean;

  // Support & Customization
  supportLevel: 'community' | 'email' | 'priority';
  customBranding: boolean;
  apiAccess: boolean;
  webhooks: boolean;

  // Point Discounts
  pointPackDiscount: number; // Percentage discount on point purchases

  // Additional Features
  priorityDelivery: boolean;
  dedicatedNumber: boolean;
  customIntegrations: boolean;

  // AI Receptionist (Premium only)
  receptionistMode: boolean;
}

export const SUBSCRIPTION_FEATURES: Record<SubscriptionTier, SubscriptionFeatures> = {
  unpaid: {
    monthlyCredits: 0,
    price: 0,
    maxContacts: 0,
    maxCampaigns: 0,
    maxFlows: 0,
    maxTemplates: 0,
    aiResponses: false,
    aiFlowGeneration: false,
    aiDocumentProcessing: false,
    advancedAI: false,
    bulkMessaging: false,
    scheduledMessages: false,
    automatedFollowUps: false,
    emailIntegration: false,
    basicAnalytics: false,
    advancedAnalytics: false,
    customReports: false,
    exportData: false,
    supportLevel: 'community',
    customBranding: false,
    apiAccess: false,
    webhooks: false,
    pointPackDiscount: 0,
    priorityDelivery: false,
    dedicatedNumber: false,
    customIntegrations: false,
    receptionistMode: false
  },

  growth: {
    monthlyCredits: 3000,
    price: 30,
    maxContacts: -1, // Unlimited
    maxCampaigns: -1, // Unlimited
    maxFlows: -1, // Unlimited
    maxTemplates: -1, // Unlimited
    aiResponses: true,
    aiFlowGeneration: true,
    aiDocumentProcessing: true,
    advancedAI: true,
    bulkMessaging: true,
    scheduledMessages: true,
    automatedFollowUps: true,
    emailIntegration: true,
    basicAnalytics: true,
    advancedAnalytics: true,
    customReports: true,
    exportData: true,
    supportLevel: 'priority',
    customBranding: true,
    apiAccess: true,
    webhooks: true,
    pointPackDiscount: 10,
    priorityDelivery: true,
    dedicatedNumber: true,
    customIntegrations: true,
    receptionistMode: true
  },

  scale: {
    monthlyCredits: 10000,
    price: 98,
    maxContacts: -1, // Unlimited
    maxCampaigns: -1, // Unlimited
    maxFlows: -1, // Unlimited
    maxTemplates: -1, // Unlimited
    aiResponses: true,
    aiFlowGeneration: true,
    aiDocumentProcessing: true,
    advancedAI: true,
    bulkMessaging: true,
    scheduledMessages: true,
    automatedFollowUps: true,
    emailIntegration: true,
    basicAnalytics: true,
    advancedAnalytics: true,
    customReports: true,
    exportData: true,
    supportLevel: 'priority',
    customBranding: true,
    apiAccess: true,
    webhooks: true,
    pointPackDiscount: 30,
    priorityDelivery: true,
    dedicatedNumber: true,
    customIntegrations: true,
    receptionistMode: true
  }
};

// Get features for a subscription tier
export function getSubscriptionFeatures(tier: SubscriptionTier): SubscriptionFeatures {
  return SUBSCRIPTION_FEATURES[tier];
}

// Check if user has access to a specific feature
export async function hasFeatureAccess(feature: keyof SubscriptionFeatures): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();

  if (!userData) return false;

  const tier = (userData.subscription_tier as SubscriptionTier) || 'unpaid';
  const features = SUBSCRIPTION_FEATURES[tier];

  return Boolean(features[feature]);
}

// Check if user is within their limit for a countable resource
export async function checkResourceLimit(
  resource: 'contacts' | 'campaigns' | 'flows' | 'templates',
  currentCount: number
): Promise<{ withinLimit: boolean; limit: number; upgradeRequired: boolean }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { withinLimit: false, limit: 0, upgradeRequired: true };
  }

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();

  const tier = (userData?.subscription_tier as SubscriptionTier) || 'unpaid';
  const features = SUBSCRIPTION_FEATURES[tier];

  const limitMap = {
    contacts: features.maxContacts,
    campaigns: features.maxCampaigns,
    flows: features.maxFlows,
    templates: features.maxTemplates
  };

  const limit = limitMap[resource];

  // -1 means unlimited
  if (limit === -1) {
    return { withinLimit: true, limit: -1, upgradeRequired: false };
  }

  const withinLimit = currentCount < limit;

  return {
    withinLimit,
    limit,
    upgradeRequired: !withinLimit
  };
}

// Get user's current subscription info
export async function getUserSubscription(): Promise<{
  tier: SubscriptionTier;
  features: SubscriptionFeatures;
  daysUntilRenewal: number | null;
}> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      tier: 'unpaid',
      features: SUBSCRIPTION_FEATURES.unpaid,
      daysUntilRenewal: null
    };
  }

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_tier, next_renewal_date')
    .eq('id', user.id)
    .single();

  const tier = (userData?.subscription_tier as SubscriptionTier) || 'unpaid';

  let daysUntilRenewal = null;
  if (userData?.next_renewal_date) {
    const now = new Date();
    const nextRenewal = new Date(userData.next_renewal_date);
    const diffTime = nextRenewal.getTime() - now.getTime();
    daysUntilRenewal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return {
    tier,
    features: SUBSCRIPTION_FEATURES[tier],
    daysUntilRenewal
  };
}

// Feature display names for UI
export const FEATURE_NAMES: Record<keyof SubscriptionFeatures, string> = {
  monthlyCredits: 'Monthly Credits',
  price: 'Price',
  maxContacts: 'Contact Limit',
  maxCampaigns: 'Campaign Limit',
  maxFlows: 'Flow Limit',
  maxTemplates: 'Template Limit',
  aiResponses: 'AI Smart Replies',
  aiFlowGeneration: 'AI Flow Generation',
  aiDocumentProcessing: 'AI Document Processing',
  advancedAI: 'Advanced AI Models (GPT-4)',
  bulkMessaging: 'Bulk Messaging',
  scheduledMessages: 'Scheduled Messages',
  automatedFollowUps: 'Automated Follow-ups',
  emailIntegration: 'Email Integration',
  basicAnalytics: 'Basic Analytics',
  advancedAnalytics: 'Advanced Analytics & Insights',
  customReports: 'Custom Reports',
  exportData: 'Data Export',
  supportLevel: 'Support Level',
  customBranding: 'Custom Branding',
  apiAccess: 'API Access',
  webhooks: 'Webhooks',
  pointPackDiscount: 'Point Pack Discount',
  priorityDelivery: 'Priority Message Delivery',
  dedicatedNumber: 'Dedicated Phone Number',
  customIntegrations: 'Custom Integrations',
  receptionistMode: 'AI Receptionist Mode'
};
