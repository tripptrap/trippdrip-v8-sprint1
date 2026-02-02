// Pre-built conversation flow templates per industry
// Used during onboarding to create a starter flow without AI generation costs

type DripMessage = {
  message: string;
  delayHours: number;
};

type ResponseOption = {
  label: string;
  followUpMessage: string;
  nextStepId?: string;
  action?: 'continue' | 'end';
};

type FlowStep = {
  id: string;
  yourMessage: string;
  responses: ResponseOption[];
  dripSequence?: DripMessage[];
  tag?: { label: string; color: string };
};

type RequiredQuestion = {
  question: string;
  fieldName: string;
};

export interface FlowTemplate {
  name: string;
  context: {
    whoYouAre: string;
    whatOffering: string;
    whoTexting: string;
    clientGoals: string;
  };
  steps: FlowStep[];
  requiredQuestions: RequiredQuestion[];
  requiresCall: boolean;
}

export const FLOW_TEMPLATES: Record<string, FlowTemplate> = {
  insurance: {
    name: 'Insurance Lead Qualification',
    context: {
      whoYouAre: 'Licensed insurance agent at {businessName}',
      whatOffering: 'Health, Life, Auto, Home, and Commercial insurance',
      whoTexting: 'People interested in insurance coverage',
      clientGoals: 'Qualify leads and schedule consultation appointments',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for your interest in insurance coverage. What type of insurance are you looking for?',
        responses: [
          { label: 'Health', followUpMessage: 'Great choice! Health coverage is so important.', nextStepId: '2' },
          { label: 'Auto', followUpMessage: 'We can definitely help with auto coverage.', nextStepId: '2' },
          { label: 'Home', followUpMessage: 'Home insurance is essential for protecting your investment.', nextStepId: '2' },
          { label: 'Life', followUpMessage: 'Life insurance gives you peace of mind for your family.', nextStepId: '2' },
        ],
        dripSequence: [
          { message: 'Just checking in — were you still interested in getting an insurance quote?', delayHours: 2 },
          { message: 'No worries if now isn\'t the right time. Feel free to reach out whenever you\'re ready!', delayHours: 24 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'Are you currently insured, or would this be a new policy?',
        responses: [
          { label: 'Currently insured', followUpMessage: 'Got it — we can look at getting you better rates.', nextStepId: '3' },
          { label: 'New policy', followUpMessage: 'No problem, we\'ll find the right coverage for you.', nextStepId: '3' },
          { label: 'Not sure', followUpMessage: 'That\'s okay, we can figure that out together.', nextStepId: '3' },
        ],
        dripSequence: [
          { message: 'Just wanted to follow up — are you currently insured or looking for a new policy?', delayHours: 4 },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'How many people would be on this policy? Just yourself, or your household?',
        responses: [
          { label: 'Just me', followUpMessage: 'Individual plans are straightforward. Let me get you a quote.', nextStepId: '4' },
          { label: '2 people', followUpMessage: 'A couple\'s plan — we have great options for that.', nextStepId: '4' },
          { label: 'Family (3+)', followUpMessage: 'Family plans are our specialty.', nextStepId: '4' },
        ],
        dripSequence: [
          { message: 'Quick question — how many people would need coverage?', delayHours: 4 },
        ],
      },
      {
        id: '4',
        yourMessage: 'I\'d love to put together a personalized quote for you. Would you be available for a quick 10-minute call this week?',
        responses: [
          { label: 'Yes, let\'s schedule', followUpMessage: 'Awesome! I\'ll send you a link to pick a time that works.', action: 'end' },
          { label: 'Just text for now', followUpMessage: 'No problem! I can gather some more details over text and send you a quote.', action: 'end' },
          { label: 'Not right now', followUpMessage: 'Totally understand. I\'ll follow up in a few days. Feel free to reach out anytime!', action: 'end' },
        ],
        dripSequence: [
          { message: 'Would you prefer a quick call or should I put together a quote over text?', delayHours: 24 },
        ],
        tag: { label: 'Appointment Set', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'What type of coverage?', fieldName: 'coverageType' },
      { question: 'Currently insured?', fieldName: 'currentlyInsured' },
      { question: 'Household size?', fieldName: 'householdSize' },
    ],
    requiresCall: true,
  },

  real_estate: {
    name: 'Real Estate Buyer Qualification',
    context: {
      whoYouAre: 'Licensed real estate agent at {businessName}',
      whatOffering: 'Residential and commercial real estate services',
      whoTexting: 'People looking to buy, sell, or rent property',
      clientGoals: 'Qualify buyers and schedule property showings',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for reaching out about real estate. Are you looking to buy, sell, or rent?',
        responses: [
          { label: 'Buy', followUpMessage: 'Exciting! Let\'s find your perfect home.', nextStepId: '2' },
          { label: 'Sell', followUpMessage: 'Great — I can help you get top dollar for your property.', nextStepId: '2' },
          { label: 'Rent', followUpMessage: 'We have some great rental options available.', nextStepId: '2' },
        ],
        dripSequence: [
          { message: 'Hi! Just following up — are you looking to buy, sell, or rent?', delayHours: 3 },
          { message: 'Whenever you\'re ready, I\'m here to help with your real estate needs!', delayHours: 48 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'What area are you interested in, and what\'s your budget range?',
        responses: [
          { label: 'Under $300K', followUpMessage: 'Great range — there are solid options in that price point.', nextStepId: '3' },
          { label: '$300K-$500K', followUpMessage: 'That\'s a popular range with lots of inventory.', nextStepId: '3' },
          { label: '$500K+', followUpMessage: 'Excellent — I know some beautiful properties in that range.', nextStepId: '3' },
        ],
        dripSequence: [
          { message: 'What price range and area are you considering?', delayHours: 4 },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'What\'s your timeline? When are you hoping to make a move?',
        responses: [
          { label: 'ASAP', followUpMessage: 'Let\'s get moving! I have some great listings to show you.', nextStepId: '4' },
          { label: '1-3 months', followUpMessage: 'Perfect timing to start looking.', nextStepId: '4' },
          { label: 'Just browsing', followUpMessage: 'No rush — I\'ll keep you updated on new listings.', nextStepId: '4' },
        ],
        dripSequence: [
          { message: 'When are you looking to make a move?', delayHours: 6 },
        ],
      },
      {
        id: '4',
        yourMessage: 'Are you pre-approved for a mortgage, or would you like a lender recommendation?',
        responses: [
          { label: 'Pre-approved', followUpMessage: 'You\'re ahead of the game! Let\'s schedule a showing.', nextStepId: '5' },
          { label: 'Need a lender', followUpMessage: 'I work with some great lenders. I\'ll send you a referral.', nextStepId: '5' },
          { label: 'Cash buyer', followUpMessage: 'Even better! That puts you in a strong position.', nextStepId: '5' },
        ],
        dripSequence: [
          { message: 'Have you been pre-approved for a mortgage yet?', delayHours: 24 },
        ],
        tag: { label: 'Qualified', color: '#f59e0b' },
      },
      {
        id: '5',
        yourMessage: 'I\'d love to set up a showing for you. Would you prefer weekdays or weekends?',
        responses: [
          { label: 'Weekdays', followUpMessage: 'I\'ll put together some options and send you times.', action: 'end' },
          { label: 'Weekends', followUpMessage: 'Weekends work great for showings. I\'ll send some options.', action: 'end' },
          { label: 'Either works', followUpMessage: 'Flexible is great! I\'ll find the best times.', action: 'end' },
        ],
        tag: { label: 'Showing Scheduled', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'Buying, selling, or renting?', fieldName: 'transactionType' },
      { question: 'Budget range?', fieldName: 'budget' },
      { question: 'Pre-approved?', fieldName: 'preApproval' },
    ],
    requiresCall: false,
  },

  solar: {
    name: 'Solar Consultation Qualifier',
    context: {
      whoYouAre: 'Solar energy consultant at {businessName}',
      whatOffering: 'Residential and commercial solar panel installation',
      whoTexting: 'Homeowners interested in solar energy',
      clientGoals: 'Qualify leads and schedule site surveys',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for your interest in going solar. Do you own your home?',
        responses: [
          { label: 'Yes, I own', followUpMessage: 'Great! Homeowners get the best solar benefits.', nextStepId: '2' },
          { label: 'Renting', followUpMessage: 'There are still options for renters — let me explain.', nextStepId: '2' },
        ],
        dripSequence: [
          { message: 'Quick question — do you own your home? It helps us determine the best solar options for you.', delayHours: 3 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'What does your average monthly electric bill look like?',
        responses: [
          { label: 'Under $150', followUpMessage: 'Solar can still make a big difference at that level.', nextStepId: '3' },
          { label: '$150-$300', followUpMessage: 'That\'s a great range for solar savings.', nextStepId: '3' },
          { label: '$300+', followUpMessage: 'You could see significant savings with solar!', nextStepId: '3' },
        ],
        dripSequence: [
          { message: 'How much are you currently paying for electricity each month?', delayHours: 4 },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'Do you know the approximate age and condition of your roof?',
        responses: [
          { label: 'Under 10 years', followUpMessage: 'Perfect — a newer roof is ideal for solar panels.', nextStepId: '4' },
          { label: '10-20 years', followUpMessage: 'That should work. We\'ll check it during the site survey.', nextStepId: '4' },
          { label: 'Needs replacement', followUpMessage: 'We can actually bundle roof + solar for the best deal.', nextStepId: '4' },
        ],
        dripSequence: [
          { message: 'How old is your roof? This helps us plan the best installation approach.', delayHours: 6 },
        ],
      },
      {
        id: '4',
        yourMessage: 'We offer $0 down financing, lease, and purchase options. Which interests you most?',
        responses: [
          { label: '$0 down financing', followUpMessage: 'Our most popular option! You start saving from day one.', nextStepId: '5' },
          { label: 'Lease', followUpMessage: 'Leasing is a great low-commitment way to go solar.', nextStepId: '5' },
          { label: 'Purchase', followUpMessage: 'Purchasing gives you the maximum long-term savings.', nextStepId: '5' },
        ],
        tag: { label: 'Qualified', color: '#f59e0b' },
      },
      {
        id: '5',
        yourMessage: 'I\'d love to schedule a free site survey to give you an exact savings estimate. What day works best?',
        responses: [
          { label: 'This week', followUpMessage: 'I\'ll send you available times for this week.', action: 'end' },
          { label: 'Next week', followUpMessage: 'I\'ll get you scheduled for next week.', action: 'end' },
          { label: 'Just send info', followUpMessage: 'No problem — I\'ll send over some details and we can schedule when you\'re ready.', action: 'end' },
        ],
        tag: { label: 'Site Survey', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'Homeowner?', fieldName: 'homeOwnership' },
      { question: 'Monthly electric bill?', fieldName: 'electricBill' },
      { question: 'Roof condition?', fieldName: 'roofCondition' },
    ],
    requiresCall: false,
  },

  roofing: {
    name: 'Roofing Lead Qualification',
    context: {
      whoYouAre: 'Roofing specialist at {businessName}',
      whatOffering: 'Residential and commercial roofing services',
      whoTexting: 'Homeowners needing roof repair or replacement',
      clientGoals: 'Qualify leads and schedule roof inspections',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for reaching out about roofing. What brings you in — repair, replacement, or a new build?',
        responses: [
          { label: 'Repair', followUpMessage: 'We handle all types of roof repairs.', nextStepId: '2' },
          { label: 'Replacement', followUpMessage: 'A new roof can transform your home. Let\'s get you a quote.', nextStepId: '2' },
          { label: 'Storm damage', followUpMessage: 'We specialize in storm damage claims. We can help.', nextStepId: '2' },
          { label: 'New build', followUpMessage: 'We\'d love to work on your new construction project.', nextStepId: '2' },
        ],
        dripSequence: [
          { message: 'Hi! Just following up — do you need a roof repair, replacement, or inspection?', delayHours: 3 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'Do you know the approximate age of your current roof?',
        responses: [
          { label: 'Under 10 years', followUpMessage: 'Likely just needs a repair. We\'ll take a look.', nextStepId: '3' },
          { label: '10-20 years', followUpMessage: 'Getting to that age — worth an inspection.', nextStepId: '3' },
          { label: '20+ years', followUpMessage: 'Probably time to consider replacement options.', nextStepId: '3' },
          { label: 'Not sure', followUpMessage: 'No worries — we\'ll figure it out during the inspection.', nextStepId: '3' },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'Are you dealing with any active leaks or is this more preventative?',
        responses: [
          { label: 'Active leak', followUpMessage: 'We can get someone out quickly for urgent repairs.', nextStepId: '4' },
          { label: 'Preventative', followUpMessage: 'Smart thinking — prevention saves money long term.', nextStepId: '4' },
          { label: 'Insurance claim', followUpMessage: 'We work with insurance companies regularly and can help with the claim process.', nextStepId: '4' },
        ],
        dripSequence: [
          { message: 'Is your roof issue urgent or are you planning ahead?', delayHours: 4 },
        ],
      },
      {
        id: '4',
        yourMessage: 'I\'d like to schedule a free roof inspection. We\'ll give you an honest assessment and estimate. What day works?',
        responses: [
          { label: 'ASAP', followUpMessage: 'I\'ll get you the earliest available slot.', action: 'end' },
          { label: 'This week', followUpMessage: 'I\'ll send you some available times this week.', action: 'end' },
          { label: 'Next week', followUpMessage: 'I\'ll get you set up for next week.', action: 'end' },
        ],
        tag: { label: 'Inspection Scheduled', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'Type of work needed?', fieldName: 'workType' },
      { question: 'Roof age?', fieldName: 'roofAge' },
      { question: 'Urgency level?', fieldName: 'urgency' },
    ],
    requiresCall: false,
  },

  home_services: {
    name: 'Home Services Lead Qualification',
    context: {
      whoYouAre: 'Home services professional at {businessName}',
      whatOffering: 'HVAC, plumbing, electrical, and general home services',
      whoTexting: 'Homeowners needing home repairs or maintenance',
      clientGoals: 'Qualify service requests and schedule appointments',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for reaching out. What type of service do you need?',
        responses: [
          { label: 'HVAC', followUpMessage: 'We handle all heating and cooling needs.', nextStepId: '2' },
          { label: 'Plumbing', followUpMessage: 'Our plumbing team can take care of that.', nextStepId: '2' },
          { label: 'Electrical', followUpMessage: 'We have licensed electricians ready to help.', nextStepId: '2' },
          { label: 'Other', followUpMessage: 'Tell me more about what you need and we\'ll get you sorted.', nextStepId: '2' },
        ],
        dripSequence: [
          { message: 'Hi! What type of home service can we help you with?', delayHours: 2 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'Is this an emergency or can it be scheduled?',
        responses: [
          { label: 'Emergency', followUpMessage: 'We\'ll prioritize getting someone out to you right away.', nextStepId: '3' },
          { label: 'Can be scheduled', followUpMessage: 'Great — let\'s find a convenient time for you.', nextStepId: '3' },
          { label: 'Just need a quote', followUpMessage: 'Happy to provide an estimate.', nextStepId: '3' },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'Can you briefly describe the issue so we can send the right technician?',
        responses: [
          { label: 'Described via text', followUpMessage: 'Thanks for the details! That helps us prepare.', nextStepId: '4' },
          { label: 'Hard to explain', followUpMessage: 'No problem — our tech will assess on-site.', nextStepId: '4' },
          { label: 'Send a photo', followUpMessage: 'A photo would be super helpful! Go ahead and send it.', nextStepId: '4' },
        ],
        dripSequence: [
          { message: 'Could you describe the issue briefly so we can send the right person?', delayHours: 3 },
        ],
      },
      {
        id: '4',
        yourMessage: 'Let\'s get you scheduled. What day and time works best?',
        responses: [
          { label: 'Morning', followUpMessage: 'I\'ll find you a morning slot.', action: 'end' },
          { label: 'Afternoon', followUpMessage: 'Afternoon works. I\'ll send you available times.', action: 'end' },
          { label: 'Weekend', followUpMessage: 'We do weekend appointments too. I\'ll check availability.', action: 'end' },
        ],
        tag: { label: 'Scheduled', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'Service type?', fieldName: 'serviceType' },
      { question: 'Urgency?', fieldName: 'urgency' },
    ],
    requiresCall: false,
  },

  financial_services: {
    name: 'Financial Services Consultation',
    context: {
      whoYouAre: 'Financial advisor at {businessName}',
      whatOffering: 'Financial planning, investment, tax, and mortgage services',
      whoTexting: 'People seeking financial guidance',
      clientGoals: 'Qualify prospects and schedule consultation calls',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for reaching out. What financial service are you interested in?',
        responses: [
          { label: 'Investment', followUpMessage: 'Smart move! Let\'s talk about your investment goals.', nextStepId: '2' },
          { label: 'Tax planning', followUpMessage: 'Tax strategy is key to building wealth.', nextStepId: '2' },
          { label: 'Mortgage', followUpMessage: 'We can help you find the best rates.', nextStepId: '2' },
          { label: 'General planning', followUpMessage: 'A solid financial plan makes all the difference.', nextStepId: '2' },
        ],
        dripSequence: [
          { message: 'Hi! What area of financial planning can we help you with?', delayHours: 4 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'What\'s your primary financial goal right now?',
        responses: [
          { label: 'Retirement', followUpMessage: 'Planning for retirement is one of the smartest things you can do.', nextStepId: '3' },
          { label: 'Debt reduction', followUpMessage: 'We can build a strategy to get you debt-free faster.', nextStepId: '3' },
          { label: 'Wealth building', followUpMessage: 'Let\'s build a plan to grow your wealth.', nextStepId: '3' },
          { label: 'Tax savings', followUpMessage: 'There are usually more deductions available than people realize.', nextStepId: '3' },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'I\'d love to do a free 30-minute consultation to review your situation. Would you prefer a call or video meeting?',
        responses: [
          { label: 'Phone call', followUpMessage: 'Great — I\'ll send you a link to schedule a call.', action: 'end' },
          { label: 'Video meeting', followUpMessage: 'Perfect — I\'ll send a Zoom link with available times.', action: 'end' },
          { label: 'Just send info first', followUpMessage: 'No problem. I\'ll email you some materials to review first.', action: 'end' },
        ],
        tag: { label: 'Consultation Set', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'Service interest?', fieldName: 'serviceInterest' },
      { question: 'Financial goal?', fieldName: 'financialGoal' },
    ],
    requiresCall: true,
  },

  healthcare: {
    name: 'Healthcare Appointment Qualifier',
    context: {
      whoYouAre: 'Healthcare coordinator at {businessName}',
      whatOffering: 'Medical, dental, specialist, and wellness services',
      whoTexting: 'Patients seeking healthcare appointments',
      clientGoals: 'Qualify patient needs and schedule appointments',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for contacting us. Are you a new or existing patient?',
        responses: [
          { label: 'New patient', followUpMessage: 'Welcome! We\'re happy to have you.', nextStepId: '2' },
          { label: 'Existing patient', followUpMessage: 'Welcome back! How can we help?', nextStepId: '2' },
        ],
        dripSequence: [
          { message: 'Hi! We\'d love to help you schedule an appointment. Are you a new or existing patient?', delayHours: 4 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'What type of appointment are you looking for?',
        responses: [
          { label: 'General checkup', followUpMessage: 'Regular checkups are important for your health.', nextStepId: '3' },
          { label: 'Specific concern', followUpMessage: 'We\'ll make sure you see the right provider.', nextStepId: '3' },
          { label: 'Follow-up', followUpMessage: 'I\'ll get you scheduled for a follow-up.', nextStepId: '3' },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'Do you have insurance, or would this be self-pay?',
        responses: [
          { label: 'Have insurance', followUpMessage: 'We accept most major insurers. We\'ll verify your coverage.', nextStepId: '4' },
          { label: 'Self-pay', followUpMessage: 'We offer competitive self-pay rates.', nextStepId: '4' },
        ],
      },
      {
        id: '4',
        yourMessage: 'Let\'s get you scheduled. Do you prefer mornings or afternoons?',
        responses: [
          { label: 'Morning', followUpMessage: 'I\'ll find you a morning opening.', action: 'end' },
          { label: 'Afternoon', followUpMessage: 'Afternoons it is. I\'ll send available slots.', action: 'end' },
          { label: 'First available', followUpMessage: 'I\'ll get you the soonest opening.', action: 'end' },
        ],
        tag: { label: 'Appointment Set', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'New or existing patient?', fieldName: 'patientStatus' },
      { question: 'Appointment type?', fieldName: 'appointmentType' },
    ],
    requiresCall: false,
  },

  automotive: {
    name: 'Automotive Sales Qualifier',
    context: {
      whoYouAre: 'Automotive sales specialist at {businessName}',
      whatOffering: 'New and used vehicles, service, and financing',
      whoTexting: 'People interested in purchasing or servicing a vehicle',
      clientGoals: 'Qualify buyers and schedule test drives',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for your interest. Are you looking for a new vehicle, used, or need service?',
        responses: [
          { label: 'New vehicle', followUpMessage: 'We have a great selection of new models.', nextStepId: '2' },
          { label: 'Used vehicle', followUpMessage: 'Our pre-owned inventory is top quality.', nextStepId: '2' },
          { label: 'Service', followUpMessage: 'Our service center can take care of you.', nextStepId: '4' },
        ],
        dripSequence: [
          { message: 'Hi! Were you looking at new vehicles, used, or need service?', delayHours: 3 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'What type of vehicle are you looking for — sedan, SUV, truck?',
        responses: [
          { label: 'Sedan', followUpMessage: 'Sedans are great for fuel efficiency and comfort.', nextStepId: '3' },
          { label: 'SUV', followUpMessage: 'SUVs are our most popular category right now.', nextStepId: '3' },
          { label: 'Truck', followUpMessage: 'We have some great trucks on the lot.', nextStepId: '3' },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'What\'s your budget range, and are you looking to finance or pay cash?',
        responses: [
          { label: 'Finance', followUpMessage: 'We have competitive financing rates.', nextStepId: '4' },
          { label: 'Cash', followUpMessage: 'Cash deals can get you great pricing.', nextStepId: '4' },
          { label: 'Exploring options', followUpMessage: 'No pressure — let\'s find what works best for you.', nextStepId: '4' },
        ],
        tag: { label: 'Qualified', color: '#f59e0b' },
      },
      {
        id: '4',
        yourMessage: 'Would you like to come in for a test drive? We\'re open 7 days a week.',
        responses: [
          { label: 'Yes, schedule me', followUpMessage: 'Great! What day works best for you?', action: 'end' },
          { label: 'Send me inventory', followUpMessage: 'I\'ll send you some options that match your criteria.', action: 'end' },
          { label: 'Just browsing', followUpMessage: 'No rush! I\'ll keep you posted on any deals.', action: 'end' },
        ],
        tag: { label: 'Test Drive', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'New or used?', fieldName: 'vehicleCondition' },
      { question: 'Vehicle type?', fieldName: 'vehicleType' },
      { question: 'Finance or cash?', fieldName: 'paymentMethod' },
    ],
    requiresCall: false,
  },

  retail: {
    name: 'Retail Customer Engagement',
    context: {
      whoYouAre: 'Customer service at {businessName}',
      whatOffering: 'Products and services for our customers',
      whoTexting: 'Customers interested in products or with questions',
      clientGoals: 'Answer questions and drive purchases',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for reaching out. Are you looking for a specific product or browsing?',
        responses: [
          { label: 'Specific product', followUpMessage: 'I can check availability for you right away.', nextStepId: '2' },
          { label: 'Browsing', followUpMessage: 'Happy to help you find what you need.', nextStepId: '2' },
          { label: 'Order status', followUpMessage: 'I can look that up for you. What\'s your order number?', nextStepId: '3' },
        ],
        dripSequence: [
          { message: 'Hi! Can we help you find something today?', delayHours: 2 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'What product category interests you? We can point you in the right direction.',
        responses: [
          { label: 'Told me', followUpMessage: 'Let me check what we have available.', nextStepId: '3' },
          { label: 'Need recommendations', followUpMessage: 'I\'d love to help! What are you using it for?', nextStepId: '3' },
        ],
        tag: { label: 'Interested', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'Would you like to place an order, visit us in-store, or get more info sent to you?',
        responses: [
          { label: 'Place order', followUpMessage: 'Here\'s a link to shop online, or I can help you right here.', action: 'end' },
          { label: 'Visit in-store', followUpMessage: 'We\'d love to see you! Our hours are on our website.', action: 'end' },
          { label: 'Send more info', followUpMessage: 'I\'ll send you details. Feel free to reach out anytime!', action: 'end' },
        ],
        tag: { label: 'Purchased', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'Product interest?', fieldName: 'productInterest' },
    ],
    requiresCall: false,
  },

  other: {
    name: 'Lead Qualification',
    context: {
      whoYouAre: 'Team member at {businessName}',
      whatOffering: 'Our products and services',
      whoTexting: 'People interested in learning more',
      clientGoals: 'Qualify leads and schedule follow-up conversations',
    },
    steps: [
      {
        id: '1',
        yourMessage: 'Hi! Thanks for reaching out. What can we help you with today?',
        responses: [
          { label: 'Learn more', followUpMessage: 'Happy to tell you more about what we offer.', nextStepId: '2' },
          { label: 'Get a quote', followUpMessage: 'I can put together a quote for you.', nextStepId: '2' },
          { label: 'Schedule a meeting', followUpMessage: 'Let\'s get something on the calendar.', nextStepId: '3' },
        ],
        dripSequence: [
          { message: 'Hi! Just following up — how can we help you?', delayHours: 3 },
          { message: 'Whenever you\'re ready, we\'re here to help!', delayHours: 48 },
        ],
        tag: { label: 'New Lead', color: '#3b82f6' },
      },
      {
        id: '2',
        yourMessage: 'What\'s the main problem you\'re trying to solve?',
        responses: [
          { label: 'Told me', followUpMessage: 'Got it — we can definitely help with that.', nextStepId: '3' },
          { label: 'Not sure yet', followUpMessage: 'No worries — let\'s figure it out together.', nextStepId: '3' },
        ],
        tag: { label: 'Contacted', color: '#8b5cf6' },
      },
      {
        id: '3',
        yourMessage: 'Would you like to schedule a quick call to discuss your needs in detail?',
        responses: [
          { label: 'Yes, let\'s talk', followUpMessage: 'Great! I\'ll send you a link to pick a time.', action: 'end' },
          { label: 'Send info first', followUpMessage: 'No problem — I\'ll send you some details to review.', action: 'end' },
          { label: 'Not right now', followUpMessage: 'Totally understand. Reach out anytime!', action: 'end' },
        ],
        tag: { label: 'Qualified', color: '#10b981' },
      },
    ],
    requiredQuestions: [
      { question: 'What do you need help with?', fieldName: 'need' },
    ],
    requiresCall: true,
  },
};

export function getFlowTemplate(industry: string): FlowTemplate {
  const normalized = industry.toLowerCase().replace(/[\s\/]+/g, '_');
  return FLOW_TEMPLATES[normalized] || FLOW_TEMPLATES.other;
}
