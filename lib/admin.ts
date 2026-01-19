// Admin configuration and helpers

// Admin emails - these users have access to the admin dashboard
const ADMIN_EMAILS = [
  'tripped620@gmail.com',
];

/**
 * Check if an email address belongs to an admin
 */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Get list of admin emails (for reference)
 */
export function getAdminEmails(): string[] {
  return [...ADMIN_EMAILS];
}
