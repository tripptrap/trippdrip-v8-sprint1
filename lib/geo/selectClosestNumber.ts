// Geo-Proximity Phone Number Selection
// Selects the user's phone number whose area code is closest to the lead's zip code

import { SupabaseClient } from '@supabase/supabase-js';
import { AREA_CODE_COORDS } from './areaCodeCoords';
import { ZIP_PREFIX_COORDS } from './zipPrefixCoords';

interface Coords {
  lat: number;
  lng: number;
}

/**
 * Select the user's phone number geographically closest to a lead's zip code.
 *
 * @param userId - The user whose numbers to query
 * @param leadZipCode - The lead's zip code (5-digit string, or null)
 * @param supabase - Supabase client (server or admin)
 * @returns The best phone number string (e.g., "+12125551234") or null if no numbers
 */
export async function selectClosestNumber(
  userId: string,
  leadZipCode: string | null,
  supabase: SupabaseClient
): Promise<string | null> {
  // 1. Query user's active Telnyx numbers
  const { data: numbers, error } = await supabase
    .from('user_telnyx_numbers')
    .select('phone_number')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error || !numbers || numbers.length === 0) {
    return null;
  }

  // 2. Short-circuit: only one number
  if (numbers.length === 1) {
    return numbers[0].phone_number;
  }

  // 3. Resolve lead zip to coordinates
  const leadCoords = getZipCoords(leadZipCode);
  if (!leadCoords) {
    // No zip or unresolvable — return first number
    return numbers[0].phone_number;
  }

  // 4. Find closest number by area code distance
  let bestNumber = numbers[0].phone_number;
  let bestDistance = Infinity;

  for (const num of numbers) {
    const areaCode = extractAreaCode(num.phone_number);
    if (!areaCode) continue;

    const numCoords = AREA_CODE_COORDS[areaCode];
    if (!numCoords) continue;

    const dist = haversineDistance(leadCoords, numCoords);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestNumber = num.phone_number;
    }
  }

  return bestNumber;
}

/**
 * Extract 3-digit area code from a phone number.
 * Handles formats: +12125551234, 12125551234, 2125551234
 */
function extractAreaCode(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1, 4);
  }
  if (digits.length === 10) {
    return digits.substring(0, 3);
  }
  return null;
}

/**
 * Get coordinates for a zip code using 3-digit prefix lookup.
 */
function getZipCoords(zipCode: string | null | undefined): Coords | null {
  if (!zipCode) return null;
  const cleaned = zipCode.replace(/\D/g, '');
  if (cleaned.length < 3) return null;
  const prefix = cleaned.substring(0, 3);
  return ZIP_PREFIX_COORDS[prefix] || null;
}

/**
 * Haversine distance in miles between two lat/lng points.
 */
function haversineDistance(a: Coords, b: Coords): number {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
