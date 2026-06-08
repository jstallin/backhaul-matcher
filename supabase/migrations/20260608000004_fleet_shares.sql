-- #129: share fleets across an org, view-only. A fleet owner grants specific org
-- members read access; recipients see the fleet (list + request/estimate/WWP pickers)
-- but cannot edit or delete it. View-only is enforced at the DB layer: we ADD
-- SELECT-only policies for shared recipients and leave the existing owner-scoped
-- INSERT/UPDATE/DELETE policies untouched.

CREATE TABLE public.fleet_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id            UUID NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (fleet_id, shared_with_user_id)
);
CREATE INDEX idx_fleet_shares_shared_with ON public.fleet_shares(shared_with_user_id);
CREATE INDEX idx_fleet_shares_fleet        ON public.fleet_shares(fleet_id);
ALTER TABLE public.fleet_shares ENABLE ROW LEVEL SECURITY;

-- Recursion-safe helpers. A plain EXISTS subquery across fleets <-> fleet_shares in
-- the RLS policies would trigger "infinite recursion detected in policy"; SECURITY
-- DEFINER runs the inner read with the function owner's rights, bypassing the inner
-- table's RLS and breaking the cycle.
CREATE OR REPLACE FUNCTION public.current_user_owns_fleet(p_fleet_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM fleets WHERE id = p_fleet_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.fleet_shared_with_current_user(p_fleet_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM fleet_shares WHERE fleet_id = p_fleet_id AND shared_with_user_id = auth.uid());
$$;

-- These run under the user's JWT (authenticated). #86 hygiene: revoke anon/PUBLIC.
REVOKE EXECUTE ON FUNCTION public.current_user_owns_fleet(UUID)          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fleet_shared_with_current_user(UUID)   FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_user_owns_fleet(UUID)          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fleet_shared_with_current_user(UUID)   TO authenticated, service_role;

-- fleet_shares: recipient reads their own grants; owner reads + manages grants on
-- their fleets (owner-only writes — covers the issue's "owner can share" decision).
CREATE POLICY "View own or owned fleet shares" ON public.fleet_shares
  FOR SELECT USING (shared_with_user_id = auth.uid() OR current_user_owns_fleet(fleet_id));
CREATE POLICY "Owner grants fleet shares" ON public.fleet_shares
  FOR INSERT WITH CHECK (current_user_owns_fleet(fleet_id));
CREATE POLICY "Owner revokes fleet shares" ON public.fleet_shares
  FOR DELETE USING (current_user_owns_fleet(fleet_id));

-- Additive SELECT-only access for recipients on the fleet + its child rows. The
-- existing owner policies (INSERT/UPDATE/DELETE, and the fleet_profiles FOR ALL
-- manage policy) are untouched, so recipients can read but never write.
CREATE POLICY "View fleets shared with me" ON public.fleets
  FOR SELECT USING (fleet_shared_with_current_user(id));
CREATE POLICY "View profiles of fleets shared with me" ON public.fleet_profiles
  FOR SELECT USING (fleet_shared_with_current_user(fleet_id));
CREATE POLICY "View trucks of fleets shared with me" ON public.trucks
  FOR SELECT USING (fleet_shared_with_current_user(fleet_id));
CREATE POLICY "View drivers of fleets shared with me" ON public.drivers
  FOR SELECT USING (fleet_shared_with_current_user(fleet_id));
