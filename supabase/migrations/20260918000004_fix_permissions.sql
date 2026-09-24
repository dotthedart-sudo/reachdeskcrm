-- Add missing grants to ensure RLS policies can execute the functions without throwing 42501 (Permission Denied).

GRANT EXECUTE ON FUNCTION public._team_owner_plan_context(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._owner_workspace_is_active(text, text, timestamptz) TO authenticated, service_role;
