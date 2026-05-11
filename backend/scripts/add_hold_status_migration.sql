-- ============================================================
-- MIGRATION: Add 'Hold' to the order_status PostgreSQL enum
-- Run this on your LIVE production PostgreSQL database.
-- ============================================================
-- This is safe to run multiple times (IF NOT EXISTS guard).

-- Step 1: Add the new 'Hold' value to the enum type
-- Note: In PostgreSQL, enum values cannot be added inside a transaction,
--       but IF NOT EXISTS makes this idempotent.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress';

-- Step 2: Verify the fix
SELECT enumlabel
FROM pg_enum
JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
WHERE typname = 'order_status'
ORDER BY enumsortorder;

-- Expected output should include: Pending, Hold, In Progress, Completed, Packed, Due, Delivered
