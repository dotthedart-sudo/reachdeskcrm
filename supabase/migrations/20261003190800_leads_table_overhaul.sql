-- 1. Add new columns for pinning, wrapping and persisted width
ALTER TABLE public.column_definitions 
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wrap_mode text NOT NULL DEFAULT 'clip'
    CHECK (wrap_mode IN ('clip', 'wrap')),
  -- NULL = use the app default width for that column
  ADD COLUMN IF NOT EXISTS width integer
    CHECK (width IS NULL OR (width BETWEEN 40 AND 800));

-- 2. Remove hidden_columns from table_preferences
UPDATE public.user_profiles 
SET table_preferences = table_preferences - 'hidden_columns' 
WHERE table_preferences ? 'hidden_columns';
