CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
  password_hash text NOT NULL
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions (expires_at);
CREATE INDEX sessions_idle_expiry ON sessions (idle_expires_at);

CREATE TABLE preferences (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  country_code text CHECK (country_code ~ '^[A-Z]{2}$'),
  latitude numeric(7,4) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(8,4) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, latitude, longitude)
);
CREATE INDEX preferences_owner_order ON preferences (user_id, created_at, id);

CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits (expires_at);
