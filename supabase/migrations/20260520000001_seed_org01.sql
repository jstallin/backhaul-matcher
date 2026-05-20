-- Create org01 for gmail test accounts and add js.stallings + cdogwoodv1 as admins
DO $$
DECLARE
  v_org_id   UUID;
  v_user1_id UUID;
  v_user2_id UUID;
BEGIN
  -- Create the org (skip if already exists)
  INSERT INTO public.orgs (name, email_domain, ts_onboarding_complete)
  VALUES ('org01', 'gmail.com', true)
  ON CONFLICT (email_domain) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_org_id;

  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM public.orgs WHERE email_domain = 'gmail.com';
  END IF;

  -- Look up user IDs
  SELECT id INTO v_user1_id FROM auth.users WHERE email = 'js.stallings@gmail.com';
  SELECT id INTO v_user2_id FROM auth.users WHERE email = 'cdogwoodv1@gmail.com';

  -- Add memberships (skip if already a member)
  IF v_user1_id IS NOT NULL THEN
    INSERT INTO public.org_memberships (org_id, user_id, role)
    VALUES (v_org_id, v_user1_id, 'admin')
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin';
  END IF;

  IF v_user2_id IS NOT NULL THEN
    INSERT INTO public.org_memberships (org_id, user_id, role)
    VALUES (v_org_id, v_user2_id, 'admin')
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin';
  END IF;
END;
$$;
