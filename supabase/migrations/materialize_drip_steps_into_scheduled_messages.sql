-- Link scheduled_messages back to the drip enrollment/step that produced it.
--
-- Drips previously kept only a pointer: drip_campaign_enrollments.current_step
-- plus next_send_at, with process-drips computing the following send time after
-- each one went out. That meant only ever ONE future send existed, so the
-- scheduled-messages view could not show what a lead had queued, and individual
-- future steps could not be edited or cancelled.
--
-- Materialising the whole sequence as scheduled_messages rows at enrollment
-- time fixes that, and lets one cron (process-scheduled) own delivery — which
-- matters because that path is the one carrying quiet hours, DNC, the
-- claim-before-send guard (#44), credit deduction, and thread attachment (#59).
--
-- These columns are what make a materialised row traceable, so the sequence can
-- be cancelled when the lead replies or opts out.

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS drip_enrollment_id UUID
    REFERENCES public.drip_campaign_enrollments(id) ON DELETE CASCADE;

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS drip_step_id UUID
    REFERENCES public.drip_campaign_steps(id) ON DELETE SET NULL;

-- Cancelling a lead's remaining drip messages is the hot path (every inbound
-- reply triggers it), so index the lookup.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_drip_enrollment
  ON public.scheduled_messages(drip_enrollment_id)
  WHERE drip_enrollment_id IS NOT NULL;

COMMENT ON COLUMN public.scheduled_messages.drip_enrollment_id IS
  'Set when this row was materialised from a drip enrollment. Used to cancel the remaining sequence when the lead replies or opts out. NULL for manually scheduled messages.';

COMMENT ON COLUMN public.scheduled_messages.drip_step_id IS
  'Which drip_campaign_steps row this message came from.';
