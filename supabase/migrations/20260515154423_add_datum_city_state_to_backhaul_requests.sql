ALTER TABLE backhaul_requests
  ADD COLUMN IF NOT EXISTS datum_city  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS datum_state VARCHAR(20),
  ADD COLUMN IF NOT EXISTS datum_lat   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS datum_lng   DOUBLE PRECISION;

-- Backfill clean "City, ST" rows only.
-- Only update where the state part (after last comma) is 2-4 chars — valid abbreviations.
UPDATE backhaul_requests
SET
  datum_city  = TRIM(LEFT(datum_point, LENGTH(datum_point) - LENGTH(SPLIT_PART(datum_point, ',', -1)) - 1)),
  datum_state = UPPER(TRIM(SPLIT_PART(datum_point, ',', -1)))
WHERE
  datum_point IS NOT NULL
  AND datum_point LIKE '%,%'
  AND datum_point NOT LIKE '%,%,%'
  AND datum_point !~ '^\d{5}'
  AND LENGTH(TRIM(SPLIT_PART(datum_point, ',', -1))) BETWEEN 2 AND 4;
