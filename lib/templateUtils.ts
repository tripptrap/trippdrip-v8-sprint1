/**
 * Template Utilities
 * Functions for working with message templates and variable substitution
 */

export interface TemplateVariables {
  // Lead variables
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  company?: string;

  // Agent/User variables
  agent_name?: string;
  agent_email?: string;
  agent_phone?: string;

  // Custom variables
  [key: string]: string | undefined;
}

/**
 * Extract variable names from template content
 * Finds all {variable_name} patterns
 */
export function extractVariables(content: string): string[] {
  const regex = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return variables;
}

/**
 * Replace variables in template content with actual values
 * @param content Template content with {variable} placeholders
 * @param variables Object containing variable values
 * @param fallback String to use for missing variables (default: empty string)
 */
export function substituteVariables(
  content: string,
  variables: TemplateVariables,
  fallback: string = ''
): string {
  return content.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, varName) => {
    return variables[varName] ?? fallback;
  });
}

/**
 * Validate that all required variables have values
 * @returns Array of missing variable names
 */
export function validateVariables(
  content: string,
  variables: TemplateVariables
): string[] {
  const required = extractVariables(content);
  const missing: string[] = [];

  for (const varName of required) {
    if (!variables[varName]) {
      missing.push(varName);
    }
  }

  return missing;
}

/**
 * Generate preview of template with sample data
 */
export function generatePreview(content: string): string {
  const sampleData: TemplateVariables = {
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    email: 'john@example.com',
    phone: '(555) 123-4567',
    company: 'Acme Corp',
    agent_name: 'Sarah',
    agent_email: 'sarah@company.com',
    agent_phone: '(555) 987-6543',
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    topic: 'your project',
  };

  return substituteVariables(content, sampleData, '[value]');
}

/**
 * Get lead variables from lead object
 */
export function getLeadVariables(lead: any): TemplateVariables {
  return {
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    full_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
    email: lead.email || '',
    phone: lead.phone || '',
    company: lead.company || '',
  };
}

/**
 * Common template categories
 */
export const TEMPLATE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'introduction', label: 'Introduction' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'closing', label: 'Closing' },
  { value: 'objection_handling', label: 'Objection Handling' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'thank_you', label: 'Thank You' },
] as const;

/**
 * Common variables with descriptions
 */
export const COMMON_VARIABLES = [
  { name: 'first_name', description: 'Lead first name', example: 'John' },
  { name: 'last_name', description: 'Lead last name', example: 'Doe' },
  { name: 'full_name', description: 'Lead full name', example: 'John Doe' },
  { name: 'email', description: 'Lead email', example: 'john@example.com' },
  { name: 'phone', description: 'Lead phone', example: '(555) 123-4567' },
  { name: 'company', description: 'Lead company', example: 'Acme Corp' },
  { name: 'agent_name', description: 'Your name', example: 'Sarah' },
  { name: 'agent_email', description: 'Your email', example: 'sarah@company.com' },
  { name: 'agent_phone', description: 'Your phone', example: '(555) 987-6543' },
  { name: 'date', description: 'Current date', example: new Date().toLocaleDateString() },
  { name: 'time', description: 'Current time', example: new Date().toLocaleTimeString() },
] as const;
