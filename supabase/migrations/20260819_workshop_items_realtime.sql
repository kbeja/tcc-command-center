-- Add workshop_items to Supabase's realtime publication.
--
-- Confirmed via live A/B testing (2026-08-17), while wiring a
-- WorkshopContext to fix Nav-badge staleness: useWorkshopItems()'s new
-- .channel().on('postgres_changes', ...) subscription -- the identical
-- pattern already used successfully by useProducts(), useCollections(),
-- useConcepts(), and others in src/lib/hooks.js -- connects fine (the raw
-- WebSocket opens) but never actually receives change events for
-- workshop_items. Inserting a row into `products` in the same session
-- shows up live within a couple seconds via its existing subscription;
-- the identical insert into `workshop_items` never arrives, even after
-- several seconds.
--
-- A table only broadcasts postgres_changes events if it's registered in
-- the supabase_realtime publication -- a database-level setting, separate
-- from (and in addition to) writing the client-side subscription code.
-- workshop_items was apparently never added, unlike the other tables this
-- codebase already subscribes to.
--
-- Guarded with an existence check so this is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'workshop_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_items;
  END IF;
END $$;
