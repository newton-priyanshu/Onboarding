-- Notifications → Supabase Realtime
-- ==================================
-- Enables client-side postgres_changes subscriptions on public.notifications
-- (used by src/hooks/useNotifications.ts and src/pages/NotificationsPage.tsx).
-- Without this publication entry, the subscription connects but never receives events.

-- 1. Add the table to the realtime publication (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- 2. REPLICA IDENTITY FULL — UPDATE/DELETE events must carry the full row so
--    postgres_changes can evaluate the `user_id=eq.<id>` filter on the OLD row
--    and so clients can diff old/new read state. (Default REPLICA IDENTITY only
--    ships the primary key, which would silently drop every UPDATE/DELETE event
--    that is filtered on a non-PK column.)
alter table public.notifications replica identity full;
