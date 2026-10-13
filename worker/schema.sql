-- The website's small database (Cloudflare D1): visitor counts and the wrong-password counter.
-- Safe to run again at any time; it only creates what is missing.
--   npx wrangler d1 execute yancheinu-stats --remote --file worker/schema.sql

CREATE TABLE IF NOT EXISTS daily (
  day TEXT PRIMARY KEY,            -- YYYY-MM-DD, Brooklyn time
  views INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS views (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

-- where visitors came from ("src"), what they used ("dev") and which country ("cc"); counted once per visitor per day
CREATE TABLE IF NOT EXISTS tally (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, name)
);

-- one scrambled mark per browser per day, so a visitor is counted once; cleared after a few days
CREATE TABLE IF NOT EXISTS uniq (
  day TEXT NOT NULL,
  vid TEXT NOT NULL,
  PRIMARY KEY (day, vid)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS ratelimit (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  exp INTEGER NOT NULL
);
