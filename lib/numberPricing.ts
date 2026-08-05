// What a phone number costs, in one place.
//
// This existed twice — `CREDITS_PER_NUMBER` in the purchase route and
// `POINTS_PER_NUMBER` in the modal — and the client's copy was the one that
// counted, because the route read the price out of the request body:
//
//   const { phoneNumber, credits } = await req.json();
//   const requiredCredits = credits || CREDITS_PER_NUMBER;
//
// So `{ phoneNumber, credits: 1 }` bought a 100-credit number for 1 credit, and
// the balance check above it used the same caller-supplied figure, so it passed
// trivially (#141). Two copies of a price is a bug waiting to happen; a price
// the client sends you is not a price at all.
//
// The server derives the charge from this constant and never from the request.
// The UI imports it only to display the number and to pre-check affordability.

/** Credits charged per additional phone number, per month. */
export const NUMBER_PRICE_CREDITS = 100;

/**
 * What this number costs to buy with credits.
 *
 * A function rather than a bare constant so that per-type pricing (toll-free vs
 * local, say) has an obvious home, and so no caller is tempted to reintroduce a
 * second copy of the number when that day comes.
 */
export function numberPriceInCredits(_phoneNumber: string): number {
  return NUMBER_PRICE_CREDITS;
}
