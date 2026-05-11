CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('master_admin', 'branch_admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('Pending', 'Hold', 'In Progress', 'Completed', 'Packed', 'Due', 'Delivered');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Migration: Add 'Hold' to order_status enum if it doesn't already exist
DO $$ BEGIN
    ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress';
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE completion_status AS ENUM ('pending', 'partial', 'completed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('Cash', 'Card', 'Bank Transfer', 'Cheque');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE material_sale_payment_method AS ENUM ('Cash', 'Card', 'Bank Transfer', 'Cheque');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE material_sale_status AS ENUM ('Paid', 'Due');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE employee_type AS ENUM ('CutBase', 'HourBase');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE supplier_payment_method AS ENUM ('Cheque', 'Bank Transfer', 'Money');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT NULL,
    phone VARCHAR(64) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_branches_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
    username VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_tenant_username UNIQUE (tenant_id, username)
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(64) NULL,
    address TEXT NULL,
    email VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customers_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    order_number VARCHAR(120) NOT NULL,
    order_date DATE NOT NULL,
    due_date DATE NULL,
    status order_status NOT NULL,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0,
    advance NUMERIC(12,2) NOT NULL DEFAULT 0,
    emergency BOOLEAN NOT NULL DEFAULT FALSE,
    is_called BOOLEAN NOT NULL DEFAULT FALSE,
    called_timestamp TIMESTAMPTZ NULL,
    call_history JSONB NULL,
    bag_count INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_orders_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dress_type VARCHAR(120) NOT NULL,
    cloth_name VARCHAR(255) NULL,
    cloth_size NUMERIC(10,2) NULL,
    quantity INTEGER NOT NULL,
    price_per_unit NUMERIC(12,2) NOT NULL,
    note TEXT NULL,
    is_cut BOOLEAN NOT NULL DEFAULT FALSE,
    quality VARCHAR(120) NULL,
    completed_quantity INTEGER NOT NULL DEFAULT 0,
    completion_data JSONB NULL,
    completion_status completion_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_order_items_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS measurement_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id UUID NULL REFERENCES orders(id) ON DELETE SET NULL,
    order_item_id UUID NULL REFERENCES order_items(id) ON DELETE SET NULL,
    dress_type VARCHAR(120) NOT NULL,
    version_no INTEGER NOT NULL,
    note TEXT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_measurement_sets_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS measurement_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    measurement_set_id UUID NOT NULL REFERENCES measurement_sets(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    value VARCHAR(255) NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_measurement_values_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    collector_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    method payment_method NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payments_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(120) NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    mrp NUMERIC(12,2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inventory_items_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    expense_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_expenses_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS material_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    sale_date DATE NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    discount NUMERIC(12,2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method material_sale_payment_method NULL,
    customer_name VARCHAR(255) NULL,
    status material_sale_status NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_material_sales_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS material_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    material_sale_id UUID NOT NULL REFERENCES material_sales(id) ON DELETE CASCADE,
    inventory_item_id UUID NULL REFERENCES inventory_items(id) ON DELETE SET NULL,
    source_inventory_legacy_id VARCHAR(120) NULL,
    category VARCHAR(120) NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_material_sale_items_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(64) NULL,
    type employee_type NOT NULL,
    joined_date DATE NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employees_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS employee_work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    dress_type VARCHAR(120) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    work_date DATE NOT NULL,
    recorded_at TIMESTAMPTZ NULL,
    start_hour VARCHAR(32) NULL,
    end_hour VARCHAR(32) NULL,
    salary_per_hour NUMERIC(12,2) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_work_logs_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS employee_salary_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    recorded_at TIMESTAMPTZ NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_salary_payments_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(64) NULL,
    joined_date DATE NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_suppliers_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS supplier_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(12,2) NULL,
    unit_price NUMERIC(12,2) NULL,
    amount NUMERIC(12,2) NOT NULL,
    purchase_date DATE NOT NULL,
    recorded_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_supplier_purchases_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    legacy_id VARCHAR(120) NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    method supplier_payment_method NOT NULL,
    recorded_at TIMESTAMPTZ NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_supplier_payments_tenant_legacy UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_branch ON customers (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_branch_status ON orders (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_measurement_sets_customer_id ON measurement_sets (customer_id);
CREATE INDEX IF NOT EXISTS idx_measurement_values_set_id ON measurement_values (measurement_set_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant_branch ON inventory_items (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_branch ON expenses (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_material_sales_tenant_branch ON material_sales (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant_branch ON employees (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_branch ON suppliers (tenant_id, branch_id);
