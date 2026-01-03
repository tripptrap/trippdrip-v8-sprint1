'use client';

import { useState } from 'react';
import { Briefcase, Home, Zap, Copy, CheckCircle, Users, TrendingUp, Calendar, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface WorkflowTemplate {
  id: string;
  name: string;
  industry: 'insurance' | 'real-estate' | 'general';
  description: string;
  icon: any;
  color: string;
  useCase: string;
  questions: Array<{
    fieldName: string;
    question: string;
    type: 'text' | 'date' | 'choice';
  }>;
  initialMessage: string;
  followUpSequence?: string[];
  tags: string[];
}

const workflowTemplates: WorkflowTemplate[] = [
  // Insurance Agent Workflows
  {
    id: 'insurance-quote-request',
    name: 'Insurance Quote Request',
    industry: 'insurance',
    description: 'Collect essential information for auto, home, or life insurance quotes with automated follow-up.',
    icon: Briefcase,
    color: 'text-sky-600 bg-blue-100 dark:bg-blue-900/20 border-sky-500/30',
    useCase: 'Perfect for capturing leads interested in insurance quotes and scheduling policy review calls.',
    questions: [
      { fieldName: 'insurance_type', question: 'What type of insurance are you interested in? (Auto, Home, Life, or Other)', type: 'text' },
      { fieldName: 'current_coverage', question: 'Do you currently have insurance coverage? (Yes/No)', type: 'text' },
      { fieldName: 'preferred_contact', question: 'What\'s the best time to call you? (Morning, Afternoon, or Evening)', type: 'text' },
    ],
    initialMessage: 'Hi! Thanks for your interest in getting an insurance quote. I\'d love to help you find the best coverage for your needs. Let me ask you a few quick questions to get started.',
    followUpSequence: [
      'Based on your information, I can offer you competitive rates. Would you like to schedule a call to discuss your options?',
      'I have some great policy options that could save you money. When would be a good time for a quick 15-minute call?'
    ],
    tags: ['Insurance', 'Quotes', 'Lead Qualification']
  },
  {
    id: 'insurance-policy-renewal',
    name: 'Policy Renewal Reminder',
    industry: 'insurance',
    description: 'Proactively reach out to existing clients before their policy expires to discuss renewal options.',
    icon: Calendar,
    color: 'text-sky-600 bg-sky-100 dark:bg-sky-800/50 border-sky-400/30',
    useCase: 'Automate policy renewal outreach to maintain customer retention and upsell opportunities.',
    questions: [
      { fieldName: 'renewal_interest', question: 'Your policy expires soon. Would you like to review your coverage and renewal options? (Yes/No)', type: 'text' },
      { fieldName: 'coverage_changes', question: 'Have there been any changes in your life that might affect your coverage needs?', type: 'text' },
    ],
    initialMessage: 'Hi [Name]! This is a friendly reminder that your [Policy Type] policy is coming up for renewal on [Date]. I want to make sure you have the best coverage at the best rate.',
    followUpSequence: [
      'I\'ve reviewed your current policy and found some ways we could potentially save you money or improve your coverage.',
      'Let\'s schedule a quick call to go over your renewal options. When works best for you?'
    ],
    tags: ['Insurance', 'Renewal', 'Retention']
  },
  {
    id: 'insurance-claim-follow-up',
    name: 'Claim Status Follow-Up',
    industry: 'insurance',
    description: 'Keep clients informed about their claim status and collect additional information if needed.',
    icon: TrendingUp,
    color: 'text-sky-600 bg-sky-100 dark:bg-sky-900/20 border-sky-500/30',
    useCase: 'Improve customer satisfaction by proactively communicating claim progress.',
    questions: [
      { fieldName: 'claim_questions', question: 'Do you have any questions about your claim?', type: 'text' },
      { fieldName: 'additional_info', question: 'Is there any additional information you need to provide?', type: 'text' },
    ],
    initialMessage: 'Hi [Name], I wanted to update you on your claim #[Claim Number]. The current status is: [Status]. ',
    tags: ['Insurance', 'Claims', 'Customer Service']
  },

  // Real Estate Agent Workflows
  {
    id: 'real-estate-buyer-qualification',
    name: 'Buyer Qualification',
    industry: 'real-estate',
    description: 'Qualify potential home buyers by understanding their needs, budget, and timeline.',
    icon: Home,
    color: 'text-sky-600 bg-orange-100 dark:bg-orange-900/20 border-sky-400/30',
    useCase: 'Quickly identify serious buyers and gather information to match them with perfect properties.',
    questions: [
      { fieldName: 'home_type', question: 'What type of property are you looking for? (Single Family, Condo, Townhouse, etc.)', type: 'text' },
      { fieldName: 'budget', question: 'What\'s your budget range?', type: 'text' },
      { fieldName: 'timeline', question: 'When are you looking to move? (ASAP, 1-3 months, 3-6 months, Just browsing)', type: 'text' },
      { fieldName: 'preapproved', question: 'Have you been pre-approved for a mortgage? (Yes/No/In Progress)', type: 'text' },
    ],
    initialMessage: 'Hi! I\'m excited to help you find your dream home. Let me ask you a few questions so I can find properties that match exactly what you\'re looking for.',
    followUpSequence: [
      'Great! Based on what you told me, I have several properties that might be perfect for you. Would you like to schedule a showing?',
      'I just got a new listing that matches your criteria. Want to be one of the first to see it?'
    ],
    tags: ['Real Estate', 'Buyers', 'Lead Qualification']
  },
  {
    id: 'real-estate-seller-lead',
    name: 'Seller Lead Capture',
    industry: 'real-estate',
    description: 'Engage potential home sellers and gather property details for a listing consultation.',
    icon: Users,
    color: 'text-sky-400 bg-cyan-100 dark:bg-cyan-900/20 border-sky-500/30',
    useCase: 'Convert seller leads into listing appointments by understanding their motivation and property.',
    questions: [
      { fieldName: 'property_address', question: 'What\'s the address of the property you\'re thinking about selling?', type: 'text' },
      { fieldName: 'timeline', question: 'When are you planning to sell? (ASAP, 1-3 months, 3-6 months, Just curious)', type: 'text' },
      { fieldName: 'reason', question: 'What\'s prompting you to sell? (Upsizing, Downsizing, Relocating, etc.)', type: 'text' },
    ],
    initialMessage: 'Hi! Thanks for reaching out about selling your home. I\'d love to help you get the best price possible. Let me ask you a few quick questions.',
    followUpSequence: [
      'Based on current market conditions, your home could be worth [Estimated Value]. Would you like a free, no-obligation market analysis?',
      'I\'d love to schedule a time to walk through your home and discuss a marketing strategy. When works for you?'
    ],
    tags: ['Real Estate', 'Sellers', 'Listings']
  },
  {
    id: 'real-estate-open-house-followup',
    name: 'Open House Follow-Up',
    industry: 'real-estate',
    description: 'Automatically follow up with open house attendees to gauge interest and schedule private showings.',
    icon: Calendar,
    color: 'text-sky-400 bg-sky-100 dark:bg-sky-900/20 border-sky-500/30',
    useCase: 'Turn open house visitors into qualified buyers with timely, personalized follow-up.',
    questions: [
      { fieldName: 'property_interest', question: 'Thanks for visiting [Property Address]! What did you think of the property? (Loved it, It was nice, Not for me)', type: 'text' },
      { fieldName: 'showing_request', question: 'Would you like to schedule a private showing to take another look?', type: 'text' },
    ],
    initialMessage: 'Hi [Name]! It was great meeting you at the open house today for [Property Address]. I wanted to follow up and see if you have any questions.',
    followUpSequence: [
      'I have a few similar properties that just hit the market. Would you like to see them?',
      'This property is getting a lot of interest. Let me know if you\'d like to make an offer or see it again!'
    ],
    tags: ['Real Estate', 'Open House', 'Follow-Up']
  },
  {
    id: 'real-estate-market-update',
    name: 'Market Update Drip',
    industry: 'real-estate',
    description: 'Keep past clients engaged with regular market updates and stay top-of-mind for referrals.',
    icon: TrendingUp,
    color: 'text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20 border-yellow-500/30',
    useCase: 'Build long-term relationships and generate repeat business through valuable market insights.',
    questions: [
      { fieldName: 'referral_interest', question: 'Do you know anyone looking to buy or sell in the area?', type: 'text' },
    ],
    initialMessage: 'Hi [Name]! Quick market update for [Neighborhood]: Home prices are [up/down] [X]% this month. Your home\'s estimated value is now [Value]. Thinking about selling?',
    tags: ['Real Estate', 'Market Updates', 'Retention']
  },

  // Additional Insurance Workflows
  {
    id: 'insurance-cross-sell',
    name: 'Cross-Sell Opportunity',
    industry: 'insurance',
    description: 'Identify and convert cross-sell opportunities with existing clients.',
    icon: Users,
    color: 'text-sky-600 bg-sky-100 dark:bg-sky-900/20 border-sky-400/30',
    useCase: 'Maximize customer lifetime value by offering complementary insurance products.',
    questions: [
      { fieldName: 'current_policies', question: 'Which insurance policies do you currently have with us? (Auto, Home, Life, etc.)', type: 'text' },
      { fieldName: 'family_coverage', question: 'Are all family members adequately covered?', type: 'text' },
      { fieldName: 'bundle_interest', question: 'Would you be interested in bundling for additional savings?', type: 'text' },
    ],
    initialMessage: 'Hi [Name]! As a valued client, I wanted to reach out about ways we could potentially save you money and provide better protection for your family.',
    followUpSequence: [
      'Did you know you could save up to 25% by bundling your policies? Let me show you how.',
      'I\'ve prepared a custom quote that could save you $[Amount] annually. Want to see the details?'
    ],
    tags: ['Insurance', 'Cross-Sell', 'Retention']
  },
  {
    id: 'insurance-referral-request',
    name: 'Referral Request Campaign',
    industry: 'insurance',
    description: 'Encourage satisfied clients to refer friends and family with incentive offers.',
    icon: MessageSquare,
    color: 'text-amber-400 bg-amber-900/20 border-amber-500/30',
    useCase: 'Generate new leads through your existing happy customer base.',
    questions: [
      { fieldName: 'referral_names', question: 'Do you know anyone who might benefit from better insurance coverage?', type: 'text' },
      { fieldName: 'referral_contact', question: 'Would you like me to reach out to them, or would you prefer to introduce us?', type: 'text' },
    ],
    initialMessage: 'Hi [Name]! I hope you\'re enjoying your coverage with us. As a thank you, we\'re offering [Incentive] for every friend or family member you refer who gets a quote.',
    tags: ['Insurance', 'Referrals', 'Growth']
  },

  // Additional Real Estate Workflows
  {
    id: 'real-estate-first-time-buyer',
    name: 'First-Time Home Buyer Guide',
    industry: 'real-estate',
    description: 'Guide first-time buyers through the home buying process with educational follow-ups.',
    icon: Users,
    color: 'text-sky-600 bg-sky-100 dark:bg-sky-900/20 border-sky-500/30',
    useCase: 'Build trust with first-time buyers by providing value and education throughout their journey.',
    questions: [
      { fieldName: 'buyer_experience', question: 'Is this your first time buying a home? (Yes/No)', type: 'text' },
      { fieldName: 'pre_approval_status', question: 'Have you spoken with a lender yet? (Yes/No/Need Recommendation)', type: 'text' },
      { fieldName: 'preferred_area', question: 'Which neighborhoods or areas are you interested in?', type: 'text' },
      { fieldName: 'move_in_timeline', question: 'What\'s your ideal move-in timeframe?', type: 'text' },
    ],
    initialMessage: 'Hi! Congrats on taking the first step toward homeownership! I specialize in helping first-time buyers navigate the process. Let me ask you a few questions to get started.',
    followUpSequence: [
      'Here\'s a helpful guide I put together on the home buying process. Would you like me to walk you through it?',
      'I can connect you with trusted lenders who offer great rates for first-time buyers. Interested?',
      'I found some properties in [Area] within your budget. Want to schedule a showing this weekend?'
    ],
    tags: ['Real Estate', 'First-Time Buyers', 'Education']
  },
  {
    id: 'real-estate-investor-outreach',
    name: 'Investment Property Outreach',
    industry: 'real-estate',
    description: 'Connect with real estate investors looking for rental properties or fix-and-flip opportunities.',
    icon: TrendingUp,
    color: 'text-violet-400 bg-violet-900/20 border-violet-500/30',
    useCase: 'Attract investor clients and build long-term relationships in the investment property market.',
    questions: [
      { fieldName: 'investment_type', question: 'What type of investment property interests you? (Rental, Fix-and-Flip, Commercial, Multi-Family)', type: 'text' },
      { fieldName: 'cash_flow_goal', question: 'What\'s your target cash flow or ROI?', type: 'text' },
      { fieldName: 'market_area', question: 'Are you looking in any specific neighborhoods or cities?', type: 'text' },
    ],
    initialMessage: 'Hi! I help investors find profitable real estate opportunities in [Market]. Let me ask a few questions to understand your investment goals.',
    followUpSequence: [
      'I have an off-market property that could generate [X]% ROI. Want the details?',
      'Just ran the numbers on a multi-family property in [Area]. The cash flow looks strong. Interested?'
    ],
    tags: ['Real Estate', 'Investors', 'Lead Generation']
  },
  {
    id: 'real-estate-expired-listing',
    name: 'Expired Listing Outreach',
    industry: 'real-estate',
    description: 'Convert expired listings by offering a fresh marketing strategy and pricing analysis.',
    icon: Briefcase,
    color: 'text-sky-600 bg-sky-100 dark:bg-sky-900/20 border-sky-500/30',
    useCase: 'Win new listings by demonstrating your superior marketing approach to frustrated sellers.',
    questions: [
      { fieldName: 'previous_listing_experience', question: 'I noticed your listing expired. What was the biggest challenge you faced?', type: 'text' },
      { fieldName: 'still_interested', question: 'Are you still interested in selling, or have your plans changed?', type: 'text' },
      { fieldName: 'listing_concerns', question: 'What would need to be different for you to list again?', type: 'text' },
    ],
    initialMessage: 'Hi [Name], I noticed your property at [Address] didn\'t sell. I specialize in selling homes that didn\'t sell the first time - often for more than the original listing price.',
    followUpSequence: [
      'I\'ve sold [X] homes in your neighborhood this year. My average days on market is [Y] days. Want to see my marketing plan?',
      'I\'d love to offer you a free updated market analysis. No obligation - just want to show you what\'s changed since you listed.'
    ],
    tags: ['Real Estate', 'Expired Listings', 'Listing Acquisition']
  },
  {
    id: 'real-estate-fsbo-conversion',
    name: 'FSBO Conversion',
    industry: 'real-estate',
    description: 'Convert For Sale By Owner listings by offering professional expertise and marketing.',
    icon: Home,
    color: 'text-sky-600 bg-sky-100 dark:bg-sky-900/20 border-sky-400/30',
    useCase: 'Help FSBO sellers understand the value of professional representation.',
    questions: [
      { fieldName: 'fsbo_duration', question: 'How long have you been selling on your own?', type: 'text' },
      { fieldName: 'showing_count', question: 'How many showings have you had so far?', type: 'text' },
      { fieldName: 'biggest_challenge', question: 'What\'s been the most challenging part of selling on your own?', type: 'text' },
    ],
    initialMessage: 'Hi! I saw you\'re selling your home at [Address] on your own. Kudos for taking that on! I wanted to reach out and offer some free advice from my [X] years of experience.',
    followUpSequence: [
      'Did you know that agent-represented homes sell for an average of [X]% more than FSBO? I can show you the data for your neighborhood.',
      'I have several qualified buyers looking in your area. Would you be open to me bringing them by?'
    ],
    tags: ['Real Estate', 'FSBO', 'Lead Conversion']
  },

  // General Purpose
  {
    id: 'appointment-scheduler',
    name: 'Appointment Scheduler',
    industry: 'general',
    description: 'Universal appointment scheduling flow that integrates with your calendar.',
    icon: Calendar,
    color: 'text-sky-600 bg-indigo-900/20 border-sky-400/30',
    useCase: 'Schedule calls, consultations, or meetings with automated calendar integration.',
    questions: [
      { fieldName: 'meeting_purpose', question: 'What would you like to discuss on our call?', type: 'text' },
    ],
    initialMessage: 'Hi! I\'d love to schedule a time to chat. What works best for your schedule?',
    tags: ['General', 'Scheduling', 'Calendar']
  },
  {
    id: 'general-feedback-collection',
    name: 'Customer Feedback Collection',
    industry: 'general',
    description: 'Gather valuable customer feedback to improve your services and identify opportunities.',
    icon: MessageSquare,
    color: 'text-lime-400 bg-lime-900/20 border-lime-500/30',
    useCase: 'Collect testimonials, reviews, and improvement suggestions from clients.',
    questions: [
      { fieldName: 'satisfaction_rating', question: 'On a scale of 1-10, how satisfied are you with our service?', type: 'text' },
      { fieldName: 'improvement_suggestions', question: 'What could we do to improve your experience?', type: 'text' },
      { fieldName: 'review_willingness', question: 'Would you be willing to leave us a quick review? It really helps our business!', type: 'text' },
    ],
    initialMessage: 'Hi [Name]! Thank you for choosing us. We\'d love to hear about your experience to help us serve you better.',
    followUpSequence: [
      'Thank you for the feedback! Your input helps us improve every day.',
      'We\'d be grateful if you could share your experience on Google/Yelp. Here\'s the link: [Review Link]'
    ],
    tags: ['General', 'Feedback', 'Reviews']
  },
];

export default function AIWorkflowsPage() {
  const router = useRouter();
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const industries = [
    { id: 'all', label: 'All Workflows', icon: Zap },
    { id: 'insurance', label: 'Insurance', icon: Briefcase },
    { id: 'real-estate', label: 'Real Estate', icon: Home },
    { id: 'general', label: 'General Purpose', icon: MessageSquare },
  ];

  const filteredWorkflows = selectedIndustry === 'all'
    ? workflowTemplates
    : workflowTemplates.filter(w => w.industry === selectedIndustry);

  const handleUseTemplate = (template: WorkflowTemplate) => {
    // Copy template data to clipboard as JSON for easy paste into flow builder
    const templateData = {
      name: template.name,
      questions: template.questions,
      initialMessage: template.initialMessage,
    };

    navigator.clipboard.writeText(JSON.stringify(templateData, null, 2));
    setCopiedId(template.id);
    setTimeout(() => setCopiedId(null), 2000);

    // Navigate to flows page to create new flow
    router.push('/templates');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">AI Workflow Templates</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Pre-built conversation flows designed for insurance and real estate professionals. Click any template to get started.
        </p>
      </div>

      {/* Industry Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {industries.map((industry) => {
          const IndustryIcon = industry.icon;
          return (
            <button
              key={industry.id}
              onClick={() => setSelectedIndustry(industry.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
                selectedIndustry === industry.id
                  ? 'bg-sky-600/20 text-sky-600 border border-sky-500/30'
                  : 'bg-white text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800'
              }`}
            >
              <IndustryIcon className="h-4 w-4" />
              {industry.label}
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {workflowTemplates.filter(w => w.industry === 'insurance').length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Insurance Templates</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <Home className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {workflowTemplates.filter(w => w.industry === 'real-estate').length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Real Estate Templates</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-800/50 flex items-center justify-center">
              <Zap className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{workflowTemplates.length}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Total Templates</div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Templates Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filteredWorkflows.map((template) => {
          const TemplateIcon = template.icon;

          return (
            <div
              key={template.id}
              className={`card border ${template.color}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-lg ${template.color} flex items-center justify-center flex-shrink-0`}>
                  <TemplateIcon className={`h-6 w-6 ${template.color.split(' ')[0]}`} />
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">{template.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {template.tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-1 rounded bg-white text-slate-600 dark:text-slate-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{template.description}</p>

                  <div className="bg-white rounded-lg p-3 mb-3">
                    <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-2">Use Case</div>
                    <div className="text-sm text-slate-900 dark:text-slate-100">{template.useCase}</div>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-2">
                      Conversation Flow ({template.questions.length} questions)
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-slate-600 dark:text-slate-400 bg-white rounded p-2">
                        <span className="text-sky-600">Initial:</span> {template.initialMessage.substring(0, 100)}...
                      </div>
                      {template.questions.slice(0, 2).map((q, idx) => (
                        <div key={idx} className="text-sm text-slate-600 dark:text-slate-400 bg-white rounded p-2">
                          <span className="text-sky-600">Q{idx + 1}:</span> {q.question}
                        </div>
                      ))}
                      {template.questions.length > 2 && (
                        <div className="text-xs text-slate-600 dark:text-slate-400 italic">
                          +{template.questions.length - 2} more questions...
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleUseTemplate(template)}
                    className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {copiedId === template.id ? (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Copied! Opening Flows...
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Use This Template
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredWorkflows.length === 0 && (
        <div className="card text-center py-12">
          <MessageSquare className="h-12 w-12 text-slate-600 dark:text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No templates found</h3>
          <p className="text-slate-600 dark:text-slate-400">Try selecting a different industry</p>
        </div>
      )}
    </div>
  );
}
