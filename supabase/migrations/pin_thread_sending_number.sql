-- Pin a conversation to the number its first outbound went from (#129).
--
-- Set by trigger rather than in each route for the same reason number_type is:
-- ten places insert a message row, and one of them forgetting would silently
-- unpin a conversation — which surfaces as a lead being replied to from a
-- different number than they were contacted on, long after the change.
--
-- Only fills a NULL. Once a conversation is established on a number it stays
-- there; a later send from a different number does not move it. That is the
-- point of the pin.
CREATE OR REPLACE FUNCTION public.pin_thread_sending_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL
     AND NEW.direction = 'outbound'
     AND NEW.from_phone IS NOT NULL THEN
    UPDATE public.threads
       SET sending_number = NEW.from_phone
     WHERE id = NEW.thread_id
       AND sending_number IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pin_thread_sending_number() IS
  'Records which number a conversation runs on, from its first outbound message. Only fills a NULL — a conversation does not move once established (#129).';

DROP TRIGGER IF EXISTS trg_pin_thread_sending_number ON public.messages;
CREATE TRIGGER trg_pin_thread_sending_number
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.pin_thread_sending_number();
