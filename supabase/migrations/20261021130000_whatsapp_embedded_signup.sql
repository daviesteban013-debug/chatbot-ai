-- Embedded Signup: when a business connects its number with the Meta button, Zorax registers the
-- number with a two-step verification PIN it generates. The PIN is kept encrypted with the same key
-- as the access token so support can recover it. Browsers never read it: the column grant list of
-- 20261009155330 names the readable columns and this one is not among them.
alter table public.whatsapp_accounts add column if not exists two_step_pin_enc text;
