

export const leads: any[] = [];

export const threads: any[] = [];

export const messages: any[] = [];

/**
 * Safe helper — will not crash if a lead is missing
 */
export function findLead(id: number) {
  return leads.find(l => l.id === id);
}
