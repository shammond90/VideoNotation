-- ============================================================
-- Migration 008: Version counters + annotation soft-delete
-- ============================================================

-- 1. Project versioning
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

-- Auto-increment project version on every UPDATE
CREATE OR REPLACE FUNCTION public.increment_project_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_version ON public.projects;
CREATE TRIGGER trg_project_version
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.increment_project_version();

-- 2. Annotation versioning
ALTER TABLE public.annotations
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

-- Auto-increment annotation version on every UPDATE
CREATE OR REPLACE FUNCTION public.increment_annotation_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_annotation_version ON public.annotations;
CREATE TRIGGER trg_annotation_version
  BEFORE UPDATE ON public.annotations
  FOR EACH ROW EXECUTE FUNCTION public.increment_annotation_version();

-- 3. Soft-delete for annotations
ALTER TABLE public.annotations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index: queries on non-deleted annotations are fast
CREATE INDEX IF NOT EXISTS idx_annotations_active
  ON public.annotations(project_id, video_key)
  WHERE deleted_at IS NULL;

-- 4. Update RLS SELECT policy to filter out soft-deleted rows
DROP POLICY IF EXISTS "Users can read own annotations" ON public.annotations;
CREATE POLICY "Users can read own annotations"
  ON public.annotations FOR SELECT
  USING (
    (select auth.jwt() ->> 'sub') = user_id
    AND deleted_at IS NULL
  );
