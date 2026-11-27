/**
 * Where orders live, during the move off Firebase.
 *
 * Both flags in one file on purpose. The end of this migration should be
 * visible at a glance -- two constants, and whether Firebase still holds any
 * order data -- rather than scattered across a checkout handler and three
 * history pages where nobody could tell how far along it was.
 *
 * The order of operations matters and is why these are separate:
 *
 *   1. Orders are CREATED in Supabase (already true -- see createOrder.ts).
 *   2. Orders are READ from Supabase. That is READ_ORDERS_FROM_SUPABASE.
 *   3. Only once reading works everywhere does the Firestore copy stop being
 *      written. That is WRITE_ORDER_SHADOW_TO_FIRESTORE going false.
 *
 * Doing 3 before 2 would leave customers looking at an empty order history.
 */

/**
 * Read the customer's own order history from Supabase (/api/orders/mine)
 * rather than from Firestore.
 *
 * Covers Orders.tsx, Profile.tsx and Home.tsx. Each falls back to Firestore
 * when this is false, so it is a switch and not a one-way door.
 */
export const READ_ORDERS_FROM_SUPABASE = true;

/**
 * Still write a copy of each new order to Firestore, under the same id.
 *
 * Needed while anything other than the customer's own history reads Firestore
 * for orders. Remaining readers as of this change:
 *
 *   * src/pages/AdminDashboard.tsx -- lists orders and writes status, 7 sites
 *   * emailTriggers.ts             -- the confirmation-email poller
 *   * src/components/AdminNotifier.tsx -- the new-order listener
 *
 * When those three read Supabase, set this to false and Firebase is down to
 * sign-in alone.
 */
export const WRITE_ORDER_SHADOW_TO_FIRESTORE = true;
