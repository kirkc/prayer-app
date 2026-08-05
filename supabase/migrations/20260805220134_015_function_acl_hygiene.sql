-- Security-advisor cleanup: trigger functions were EXECUTE-able via PostgREST
-- RPC by anon/authenticated (harmless — trigger functions can't be invoked
-- directly — but there's no reason to expose them). Trigger firing does not
-- require EXECUTE at runtime (checked at CREATE TRIGGER time), verified by
-- rehearsal before applying.
--
-- The default-privileges change closes the loophole where new functions get
-- EXECUTE via PUBLIC (013's default revoke only targeted anon): from now on
-- a function is RPC-callable only if a migration grants it explicitly.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_invited() from public, anon, authenticated;
revoke execute on function public.sync_prayed_count() from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke execute on functions from public;
