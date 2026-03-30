// Admin configuration and helpers

// HIGH-3: Admin emails loaded from env var — not hardcoded in source.
// Set ADMIN_EMAILS as a comma-separated list in your .env:
//   ADMIN_EMAILS=tripped620@gmail.com,other@example.com
const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

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
