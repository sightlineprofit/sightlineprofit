create or replace function public.prevent_firm_billing_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('app.billing_update', true) = 'true'
     or current_setting('request.jwt.claim.role', true) = 'service_role'
     or public.is_super_admin() then
    return new;
  end if;

  if new.subscription_tier         is distinct from old.subscription_tier
     or new.subscription_status    is distinct from old.subscription_status
     or new.stripe_customer_id     is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.trial_ends_at          is distinct from old.trial_ends_at
     or new.owner_id               is distinct from old.owner_id then
    raise exception 'Billing and ownership columns can only be modified by billing services or super admins';
  end if;

  return new;
end $$;

create or replace function public.update_firm_billing_from_backend(
  p_firm_id uuid,
  p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_allowed text[] := array[
    'subscription_tier',
    'subscription_status',
    'trial_ends_at',
    'stripe_customer_id',
    'stripe_subscription_id',
    'current_period_end',
    'past_due_since',
    'billing_frequency',
    'stripe_price_id',
    'stripe_payment_method_id'
  ];
  v_key text;
begin
  if p_firm_id is null then
    raise exception 'Firm id is required';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be a JSON object';
  end if;

  for v_key in select jsonb_object_keys(p_patch)
  loop
    if not (v_key = any(v_allowed)) then
      raise exception 'Field % cannot be updated by billing sync', v_key;
    end if;
  end loop;

  perform set_config('app.billing_update', 'true', true);

  update public.firms
     set subscription_tier = case
           when p_patch ? 'subscription_tier' then (p_patch->>'subscription_tier')::public.subscription_tier
           else subscription_tier
         end,
         subscription_status = case
           when p_patch ? 'subscription_status' then (p_patch->>'subscription_status')::public.subscription_status
           else subscription_status
         end,
         trial_ends_at = case
           when p_patch ? 'trial_ends_at' then nullif(p_patch->>'trial_ends_at', '')::timestamptz
           else trial_ends_at
         end,
         stripe_customer_id = case
           when p_patch ? 'stripe_customer_id' then nullif(p_patch->>'stripe_customer_id', '')
           else stripe_customer_id
         end,
         stripe_subscription_id = case
           when p_patch ? 'stripe_subscription_id' then nullif(p_patch->>'stripe_subscription_id', '')
           else stripe_subscription_id
         end,
         current_period_end = case
           when p_patch ? 'current_period_end' then nullif(p_patch->>'current_period_end', '')::timestamptz
           else current_period_end
         end,
         past_due_since = case
           when p_patch ? 'past_due_since' then nullif(p_patch->>'past_due_since', '')::timestamptz
           else past_due_since
         end,
         billing_frequency = case
           when p_patch ? 'billing_frequency' then nullif(p_patch->>'billing_frequency', '')
           else billing_frequency
         end,
         stripe_price_id = case
           when p_patch ? 'stripe_price_id' then nullif(p_patch->>'stripe_price_id', '')
           else stripe_price_id
         end,
         stripe_payment_method_id = case
           when p_patch ? 'stripe_payment_method_id' then nullif(p_patch->>'stripe_payment_method_id', '')
           else stripe_payment_method_id
         end
   where id = p_firm_id;

  if not found then
    raise exception 'Firm not found';
  end if;
end $$;

revoke all on function public.update_firm_billing_from_backend(uuid, jsonb) from public;
revoke all on function public.update_firm_billing_from_backend(uuid, jsonb) from anon;
revoke all on function public.update_firm_billing_from_backend(uuid, jsonb) from authenticated;
grant execute on function public.update_firm_billing_from_backend(uuid, jsonb) to service_role;