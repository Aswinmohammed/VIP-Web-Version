# Fix for "Hold Order" Internal Server Error

## Problem
Clicking the "Hold" button causes an **Internal Server Error** because the PostgreSQL database's `order_status` enum type does not include the `'Hold'` value.

## Root Cause
- The code (Python models + TypeScript types) includes `'Hold'` as a valid order status
- The live PostgreSQL database's `order_status` enum was created before `'Hold'` was added
- When the backend tries to save an order with `status = 'Hold'`, PostgreSQL rejects it

## Solution
Run the migration to add `'Hold'` to the `order_status` enum in your PostgreSQL database.

### Option 1: Automatic Migration (Recommended)
**Restart the FastAPI backend server.** The startup migration in `main.py` will automatically add `'Hold'` to the enum:

```bash
# Stop the backend
# Then start it again - the ensure_order_status_support() function will run
```

The `ensure_order_status_support()` function in `backend/app/main.py` runs on every startup and will:
1. Check if `'Hold'` exists in the `order_status` enum
2. Add it if missing: `ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress'`
3. Print confirmation to the console

### Option 2: Manual SQL Migration
If the automatic migration doesn't work, run this SQL directly on your PostgreSQL database:

```sql
-- Connect to your database, then run:
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress';

-- Verify the fix:
SELECT enumlabel
FROM pg_enum
JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
WHERE typname = 'order_status'
ORDER BY enumsortorder;
```

Expected output should include: `Pending`, `Hold`, `In Progress`, `Completed`, `Packed`, `Due`, `Delivered`

### Option 3: Python Migration Script
Run the provided migration script:

```bash
cd "d:\VIP Web Version"
python -m backend.scripts.migrate_add_hold_status
```

## Verification
After running the migration:

1. **Check the backend logs** - you should see:
   ```
   [startup] ✅ 'Hold' already present in order_status enum.
   ```

2. **Test the Hold button** - create or edit an order and click "Hold". It should save successfully without errors.

3. **Check the database** - run this query:
   ```sql
   SELECT enumlabel FROM pg_enum
   JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
   WHERE typname = 'order_status'
   ORDER BY enumsortorder;
   ```
   
   You should see `'Hold'` in the list between `'Pending'` and `'In Progress'`.

## Why This Happened
The `'Hold'` status was added to the codebase after the initial database schema was created. The migration to add it to the enum exists in the code but needs to be run on the live database.

## Files Involved
- **Migration SQL**: `backend/scripts/add_hold_status_migration.sql`
- **Migration Script**: `backend/scripts/migrate_add_hold_status.py`
- **Startup Migration**: `backend/app/main.py` → `ensure_order_status_support()`
- **Model Definition**: `backend/app/models.py` → `OrderStatus` enum
- **Frontend Type**: `types.ts` → `Order['status']`
- **Hold Button**: `components/OrderForm.tsx` → `handleHoldSubmit()`

## Notes
- The migration is **idempotent** - safe to run multiple times
- The `IF NOT EXISTS` clause prevents errors if `'Hold'` already exists
- No data will be lost - this only adds a new enum value
