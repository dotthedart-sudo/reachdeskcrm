ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS extra_seats integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_extra_seats_nonneg;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_extra_seats_nonneg CHECK (extra_seats >= 0);
COMMENT ON COLUMN public.user_profiles.extra_seats IS
  'Paid Teams seat add-ons purchased by the workspace owner (beyond 5 included).';

CREATE OR REPLACE FUNCTION public.guard_user_profile_sensitive_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT role INTO v_caller_role FROM public.user_profiles WHERE id = auth.uid();
  IF v_caller_role = 'admin' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND auth.uid() <> OLD.id THEN
    RAISE EXCEPTION 'Cannot update another user''s profile';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'Cannot create a profile for another user';
    END IF;
    NEW.role := 'user';
    IF NEW.plan IS NULL OR NEW.plan <> 'trial' THEN NEW.plan := 'trial'; END IF;
    IF NEW.status IS NULL THEN NEW.status := 'approved';
    ELSIF NEW.status NOT IN ('approved','pending') THEN NEW.status := 'approved';
    END IF;
    NEW.account_locked := COALESCE(NEW.account_locked, false);
    NEW.lock_reason := NULL;
    NEW.payment_pending := COALESCE(NEW.payment_pending, false);
    NEW.extra_seats := 0;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Cannot change role'; END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'Cannot change plan'; END IF;
  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status THEN RAISE EXCEPTION 'Cannot change plan status'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Cannot change account status'; END IF;
  IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN RAISE EXCEPTION 'Cannot change trial end date'; END IF;
  IF NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at THEN RAISE EXCEPTION 'Cannot change plan expiry'; END IF;
  IF NEW.plan_cancels_at IS DISTINCT FROM OLD.plan_cancels_at THEN RAISE EXCEPTION 'Cannot change plan cancellation date'; END IF;
  IF NEW.paddle_subscription_status IS DISTINCT FROM OLD.paddle_subscription_status THEN RAISE EXCEPTION 'Cannot change subscription status'; END IF;
  IF NEW.account_locked IS DISTINCT FROM OLD.account_locked THEN
    IF NEW.account_locked = false AND OLD.account_locked = true
       AND NEW.team_id IS NOT NULL AND lower(COALESCE(NEW.team_role,'')) = 'member' THEN NULL;
    ELSIF NOT (NEW.account_locked = true AND OLD.account_locked = false) THEN
      RAISE EXCEPTION 'Cannot change account lock';
    END IF;
  END IF;
  IF NEW.locked_at IS DISTINCT FROM OLD.locked_at THEN
    IF NEW.account_locked = false AND OLD.account_locked = true
       AND NEW.team_id IS NOT NULL AND lower(COALESCE(NEW.team_role,'')) = 'member' THEN NULL;
    ELSIF NOT (NEW.account_locked = true AND OLD.account_locked = false) THEN
      RAISE EXCEPTION 'Cannot change lock timestamp';
    END IF;
  END IF;
  IF NEW.lock_reason IS DISTINCT FROM OLD.lock_reason THEN RAISE EXCEPTION 'Cannot change lock reason'; END IF;
  IF NEW.paddle_subscription_id IS DISTINCT FROM OLD.paddle_subscription_id THEN RAISE EXCEPTION 'Cannot change subscription'; END IF;
  IF NEW.paddle_customer_id IS DISTINCT FROM OLD.paddle_customer_id THEN RAISE EXCEPTION 'Cannot change billing customer'; END IF;
  IF NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle THEN RAISE EXCEPTION 'Cannot change billing cycle'; END IF;
  IF NEW.payment_pending IS DISTINCT FROM OLD.payment_pending THEN RAISE EXCEPTION 'Cannot change payment status'; END IF;
  IF NEW.requested_plan IS DISTINCT FROM OLD.requested_plan THEN RAISE EXCEPTION 'Cannot change requested plan'; END IF;
  IF NEW.extra_seats IS DISTINCT FROM OLD.extra_seats THEN RAISE EXCEPTION 'Cannot change extra seats'; END IF;

  RETURN NEW;
END;
$function$;
