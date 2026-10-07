ALTER TABLE preferences
  ADD COLUMN forecast_at timestamptz,
  ADD COLUMN temperature_c double precision,
  ADD COLUMN description text,
  ADD CONSTRAINT preferences_snapshot_complete CHECK (
    (forecast_at IS NULL AND temperature_c IS NULL AND description IS NULL)
    OR (
      forecast_at IS NOT NULL AND isfinite(forecast_at)
      AND temperature_c IS NOT NULL
      AND temperature_c > '-Infinity'::double precision
      AND temperature_c < 'Infinity'::double precision
      AND description IS NOT NULL AND length(description) BETWEEN 1 AND 200
    )
  );

ALTER TABLE preferences DROP CONSTRAINT preferences_user_id_latitude_longitude_key;
ALTER TABLE preferences
  ADD CONSTRAINT preferences_forecast_selection_key
  UNIQUE (user_id, latitude, longitude, forecast_at);

-- Preserve existing location-only rows without fabricating forecast evidence.
CREATE UNIQUE INDEX preferences_legacy_location_key
  ON preferences (user_id, latitude, longitude) WHERE forecast_at IS NULL;
