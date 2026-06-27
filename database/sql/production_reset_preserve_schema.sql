-- VIP Tailors production fresh-launch reset.
-- Purpose: empty application tables while preserving schema, indexes, constraints,
-- triggers, functions, enum types, row-level-security policies, and relationships.
--
-- Safer default: keep alembic_version so migration history is preserved.
-- Run only after a verified backup and only against the intended production DB.

DO $$
DECLARE
    table_list text;
BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
    INTO table_list
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'alembic_version';

    IF table_list IS NULL THEN
        RAISE NOTICE 'No application tables found to truncate.';
        RETURN;
    END IF;

    RAISE NOTICE 'Truncating tables: %', table_list;
    EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
END $$;

-- Verification query. Every returned count should be 0.
SELECT table_name,
       (xpath('/row/cnt/text()', query_to_xml(format('SELECT count(*) AS cnt FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint AS row_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name <> 'alembic_version'
ORDER BY table_name;
