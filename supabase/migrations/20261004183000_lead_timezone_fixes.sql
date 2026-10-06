-- Migration: Lead timezone fixes & folder default country
-- 1. Drop default '+92' on user_profiles.default_country_code
ALTER TABLE user_profiles ALTER COLUMN default_country_code DROP DEFAULT;

-- 2. Add default_country to folders table (stores ISO2 code, e.g. 'US', 'GB')
ALTER TABLE folders ADD COLUMN IF NOT EXISTS default_country text;
