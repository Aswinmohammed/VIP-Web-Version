-- ============================================================
-- EMERGENCY FIX: order_status enum type has uppercase labels
-- (PENDING, IN_PROGRESS, etc.) but row data has mixed-case
-- (Pending, In Progress, etc.)
--
-- Run each block separately in your Coolify DB terminal.
-- ============================================================

-- BLOCK 1: Run this first (inside a transaction is fine)
-- Recreate the enum type with correct mixed-case labels

-- Step 1: Cast the column to text so we can drop/recreate the enum
ALTER TABLE orders ALTER COLUMN status TYPE text;

-- Step 2: Drop the old enum type
DROP TYPE order_status;

-- Step 3: Recreate with correct mixed-case values
CREATE TYPE order_status AS ENUM (
    'Pending',
    'Hold',
    'In Progress',
    'Completed',
    'Packed',
    'Due',
    'Delivered'
);

-- Step 4: Fix any rows that still have old uppercase values
UPDATE orders SET status = 'Pending'     WHERE status = 'PENDING';
UPDATE orders SET status = 'Hold'        WHERE status = 'HOLD';
UPDATE orders SET status = 'In Progress' WHERE status = 'IN_PROGRESS';
UPDATE orders SET status = 'Completed'   WHERE status = 'COMPLETED';
UPDATE orders SET status = 'Packed'      WHERE status = 'PACKED';
UPDATE orders SET status = 'Due'         WHERE status = 'DUE';
UPDATE orders SET status = 'Delivered'   WHERE status = 'DELIVERED';

-- Step 5: Cast the column back to the new enum type
ALTER TABLE orders ALTER COLUMN status TYPE order_status USING status::order_status;

-- ============================================================
-- Verify: should show Pending, Hold, In Progress, etc.
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
WHERE typname = 'order_status'
ORDER BY enumsortorder;
-- ============================================================
