-- Thread archive RPCs were callable by anyone, against anyone's threads (#110 follow-on).
--
-- All three were SECURITY DEFINER — so RLS does not apply — keyed only on a
-- caller-supplied thread id, with **no ownership check**:
--
--     UPDATE public.threads SET is_archived = true WHERE id = thread_id_param;
--
-- and EXECUTE was granted to **anon** as well as authenticated. The anon key is
-- public by design; it ships in the browser bundle. So an unauthenticated caller
-- could archive or unarchive any conversation in the system.
--
-- Proven against the live database before writing this: a thread owned by
-- another account, `is_archived` false, one POST to /rest/v1/rpc/archive_thread
-- with the anon key and no session → HTTP 204, `is_archived` true.
--
-- Exploitability is limited by thread ids being random UUIDs — they cannot be
-- enumerated, so an attacker needs one from somewhere else. That is a reason it
-- was never noticed, not a reason it was safe: the control was simply absent.
--
-- `bulk_archive_threads` is the worst of the three because it takes an array, so
-- a single call could archive many threads at once.
--
-- Three changes to each:
--   1. scope the UPDATE to auth.uid()
--   2. SET search_path — SECURITY DEFINER without it is its own hazard
--   3. revoke anon; only authenticated has any business calling these
--
-- Return type stays void so no caller breaks. The app no longer uses these at
-- all (app/api/threads/manage does the scoped update inline, where the
-- ownership check is visible), but they are fixed rather than dropped because
-- they remain reachable over PostgREST regardless of what our code does.

CREATE OR REPLACE FUNCTION public.archive_thread(thread_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.threads
     SET is_archived = true, archived_at = now(), updated_at = now()
   WHERE id = thread_id_param
     AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_thread(thread_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.threads
     SET is_archived = false, archived_at = NULL, updated_at = now()
   WHERE id = thread_id_param
     AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_archive_threads(thread_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.threads
     SET is_archived = true, archived_at = now(), updated_at = now()
   WHERE id = ANY(thread_ids)
     AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.archive_thread(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unarchive_thread(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_archive_threads(uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.archive_thread(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unarchive_thread(uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_archive_threads(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.archive_thread(uuid) IS
  'Archives one of the CALLER''S OWN threads. Was SECURITY DEFINER with no ownership check and granted to anon, so anyone could archive any thread by id (#110 follow-on).';

-- The two tag RPCs have the identical defect — SECURITY DEFINER, keyed only on
-- a caller-supplied thread id, granted to anon — so anyone could add or remove
-- conversation tags on anyone's thread. Same three changes.

CREATE OR REPLACE FUNCTION public.add_thread_tag(thread_id_param uuid, tag_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.threads
     SET conversation_tags = CASE
           WHEN conversation_tags @> ARRAY[tag_name] THEN conversation_tags
           ELSE array_append(conversation_tags, tag_name)
         END,
         updated_at = now()
   WHERE id = thread_id_param
     AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_thread_tag(thread_id_param uuid, tag_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.threads
     SET conversation_tags = array_remove(conversation_tags, tag_name),
         updated_at = now()
   WHERE id = thread_id_param
     AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.add_thread_tag(uuid, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_thread_tag(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.add_thread_tag(uuid, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_thread_tag(uuid, text) TO authenticated, service_role;
