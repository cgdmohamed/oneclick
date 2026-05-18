-- Migration 022: Back-fill feature_access from plans.features->>'access' JSON
-- Idempotent: uses ON CONFLICT DO UPDATE so re-running is safe.
-- For each plan that has a valid JSON array at features->'access',
-- insert one row per feature key with enabled = true.
-- Rows that already exist (added by the Feature Access admin page) are left
-- as-is unless they originate from the plan's own features JSON, in which
-- case they are refreshed to enabled = true.
-- The CASE expression inside LATERAL guards against malformed features.access
-- values by falling back to an empty array, preventing runtime errors.

INSERT INTO feature_access (plan_id, feature_key, enabled)
SELECT
  p.id                    AS plan_id,
  feat.feature_key        AS feature_key,
  true                    AS enabled
FROM plans p
CROSS JOIN LATERAL (
  SELECT jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(p.features->'access') = 'array' THEN p.features->'access'
      ELSE '[]'::jsonb
    END
  ) AS feature_key
) feat
WHERE feat.feature_key IS NOT NULL
  AND feat.feature_key <> ''
ON CONFLICT (plan_id, feature_key)
DO UPDATE SET enabled = true;
