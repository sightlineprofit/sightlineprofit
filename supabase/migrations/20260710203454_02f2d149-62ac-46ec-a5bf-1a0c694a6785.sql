create or replace function public.prevent_firm_billing_changes()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if current_user = 'service_role'
     or current_setting('app.billing_update', true) = 'true'
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

create or replace function public.prevent_super_admin_self_grant()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if new.is_super_admin is distinct from old.is_super_admin then
    if current_user <> 'service_role'
       and current_setting('request.jwt.claim.role', true) <> 'service_role' then
      raise exception 'is_super_admin cannot be changed via the API';
    end if;
  end if;
  return new;
end $$;