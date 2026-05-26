CREATE TABLE public.work_week_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  week_deadline TIMESTAMPTZ NOT NULL,
  outbound_load JSONB,
  return_load JSONB,
  chain_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.work_week_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own work week plans" ON public.work_week_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
