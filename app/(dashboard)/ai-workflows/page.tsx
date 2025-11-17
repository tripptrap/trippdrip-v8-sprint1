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
    color: 'text-blue-400 bg-blue-900/20 border-blue-500/30',
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
    color: 'text-purple-400 bg-purple-900/20 border-purple-500/30',
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
    color: 'text-green-400 bg-green-900/20 border-green-500/30',
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
    color: 'text-orange-400 bg-orange-900/20 border-orange-500/30',
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
    color: 'text-cyan-400 bg-cyan-900/20 border-cyan-500/30',
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
    color: 'text-pink-400 bg-pink-900/20 border-pink-500/30',
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
    color: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30',
    useCase: 'Build long-term relationships and generate repeat business through valuable market insights.',
    questions: [
      { fieldName: 'referral_interest', question: 'Do you know anyone looking to buy or sell in the area?', type: 'text' },
    ],
    initialMessage: 'Hi [Name]! Quick market update for [Neighborhood]: Home prices are [up/down] [X]% this month. Your home\'s estimated value is now [Value]. Thinking about selling?',
    tags: ['Real Estate', 'Market Updates', 'Retention']
  },

  // General Purpose
  {
    id: 'appointment-scheduler',
    name: 'Appointment Scheduler',
    industry: 'general',
    description: 'Universal appointment scheduling flow that integrates with your calendar.',
    icon: Calendar,
    color: 'text-indigo-400 bg-indigo-900/20 border-indigo-500/30',
    useCase: 'Schedule calls, consultations, or meetings with automated calendar integration.',
    questions: [
      { fieldName: 'meeting_purpose', question: 'What would you like to discuss on our call?', type: 'text' },
    ],
    initialMessage: 'Hi! I\'d love to schedule a time to chat. What works best for your schedule?',
    tags: ['General', 'Scheduling', 'Calendar']
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
        <h1 className="text-2xl font-semibold text-[#e7eef9]">AI Workflow Templates</h1>
        <p className="text-[#9fb0c3] mt-1">
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
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'bg-white/5 text-[#9fb0c3] hover:bg-white/10'
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
            <div className="w-10 h-10 rounded-lg bg-blue-900/20 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">
                {workflowTemplates.filter(w => w.industry === 'insurance').length}
              </div>
              <div className="text-sm text-[#9fb0c3]">Insurance Templates</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-900/20 flex items-center justify-center">
              <Home className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">
                {workflowTemplates.filter(w => w.industry === 'real-estate').length}
              </div>
              <div className="text-sm text-[#9fb0c3]">Real Estate Templates</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-900/20 flex items-center justify-center">
              <Zap className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-[#e7eef9]">{workflowTemplates.length}</div>
              <div className="text-sm text-[#9fb0c3]">Total Templates</div>
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
                      <h3 className="font-semibold text-[#e7eef9] text-lg">{template.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {template.tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-1 rounded bg-white/5 text-[#9fb0c3]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-[#9fb0c3] mb-3">{template.description}</p>

                  <div className="bg-white/5 rounded-lg p-3 mb-3">
                    <div className="text-xs uppercase tracking-wide text-[#9fb0c3] mb-2">Use Case</div>
                    <div className="text-sm text-[#e7eef9]">{template.useCase}</div>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-wide text-[#9fb0c3] mb-2">
                      Conversation Flow ({template.questions.length} questions)
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm text-[#9fb0c3] bg-white/5 rounded p-2">
                        <span className="text-blue-400">Initial:</span> {template.initialMessage.substring(0, 100)}...
                      </div>
                      {template.questions.slice(0, 2).map((q, idx) => (
                        <div key={idx} className="text-sm text-[#9fb0c3] bg-white/5 rounded p-2">
                          <span className="text-green-400">Q{idx + 1}:</span> {q.question}
                        </div>
                      ))}
                      {template.questions.length > 2 && (
                        <div className="text-xs text-[#9fb0c3] italic">
                          +{template.questions.length - 2} more questions...
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleUseTemplate(template)}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
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
          <MessageSquare className="h-12 w-12 text-[#9fb0c3] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[#e7eef9] mb-2">No templates found</h3>
          <p className="text-[#9fb0c3]">Try selecting a different industry</p>
        </div>
      )}
    </div>
  );
}
