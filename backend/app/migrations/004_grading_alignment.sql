-- Previously applied migrations are not replayed: repair the early 003 spelling safely.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
             AND table_name='decision' AND column_name='internal_node') THEN
    ALTER TABLE decision RENAME COLUMN internal_node TO internal_note;
  END IF;
END $$;
ALTER TABLE decision ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE decision ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
ALTER TABLE rubric ALTER COLUMN region TYPE JSONB USING region::jsonb;
-- Audit base tables too, without recreating or changing their ownership.
DO $$ DECLARE t TEXT; keys TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['staff','course','course_staff','student','enrollment'] LOOP
    keys := CASE t WHEN 'staff' THEN quote_literal('directory_id')
                   WHEN 'course' THEN quote_literal('course_id')
                   WHEN 'course_staff' THEN quote_literal('course_id') || ',' || quote_literal('directory_id')
                   WHEN 'student' THEN quote_literal('uid')
                   ELSE quote_literal('course_id') || ',' || quote_literal('uid') END;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(t) AND tgname='audit_change') THEN
      EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_capture_change(%s)',t,keys);
      EXECUTE format('CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_truncate()',t);
    END IF;
  END LOOP;
END $$;
