-- Remove orphaned cancelled subscriptions that were auto-created at registration time.
-- Before this fix, registration created a free-plan trialing subscription that was
-- immediately cancelled and replaced when an admin approved the company. This migration
-- deletes those stale cancelled rows safely and idempotently.
--
-- Targets only cancelled free-plan subscriptions where the same company already has
-- a newer active or trialing subscription (i.e. the replacement subscription exists).

DELETE FROM subscriptions s
USING plans p
WHERE s.plan_id = p.id
  AND p.code = 'free'
  AND s.status = 'cancelled'
  AND EXISTS (
    SELECT 1 FROM subscriptions s2
    WHERE s2.company_id = s.company_id
      AND s2.id != s.id
      AND s2.status IN ('active', 'trialing')
      AND s2.created_at > s.created_at
  );
