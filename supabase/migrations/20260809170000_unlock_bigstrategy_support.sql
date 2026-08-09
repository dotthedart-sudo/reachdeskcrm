-- Lift moderation lock for support@bigstrategy.eu (restoreallow access)

UPDATE public.user_profiles
SET
  account_locked = false,
  locked_at = null,
  lock_reason = null
WHERE lower(email) = lower('support@bigstrategy.eu');
