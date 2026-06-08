-- #122: v2 fleet create/edit (buildFleetPayload) never wrote revenue_split_customer,
-- so it fell to the column DEFAULT 20 regardless of the carrier %. The split is strictly
-- complementary (customer = 100 - carrier), so any row where that doesn't hold is wrong.
-- Code fix writes both fields going forward; this corrects the rows already saved wrong
-- (e.g. fleets created through the v2 UI showing 20/20 instead of 20/80).
UPDATE public.fleet_profiles
SET revenue_split_customer = 100 - revenue_split_carrier
WHERE revenue_split_carrier IS NOT NULL
  AND revenue_split_customer IS DISTINCT FROM 100 - revenue_split_carrier;
