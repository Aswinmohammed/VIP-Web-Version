ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_branch_isolation_customers ON customers;
CREATE POLICY tenant_branch_isolation_customers ON customers
    USING (
        tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
        AND (
            NULLIF(current_setting('app.current_role', true), '') = 'master_admin'
            OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')
        )
    )
    WITH CHECK (
        tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
        AND (
            NULLIF(current_setting('app.current_role', true), '') = 'master_admin'
            OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')
        )
    );

DROP POLICY IF EXISTS tenant_branch_isolation_orders ON orders;
CREATE POLICY tenant_branch_isolation_orders ON orders USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_order_items ON order_items;
CREATE POLICY tenant_branch_isolation_order_items ON order_items USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_measurement_sets ON measurement_sets;
CREATE POLICY tenant_branch_isolation_measurement_sets ON measurement_sets USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_measurement_values ON measurement_values;
CREATE POLICY tenant_branch_isolation_measurement_values ON measurement_values USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_payments ON payments;
CREATE POLICY tenant_branch_isolation_payments ON payments USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_inventory_items ON inventory_items;
CREATE POLICY tenant_branch_isolation_inventory_items ON inventory_items USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_expenses ON expenses;
CREATE POLICY tenant_branch_isolation_expenses ON expenses USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_material_sales ON material_sales;
CREATE POLICY tenant_branch_isolation_material_sales ON material_sales USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_material_sale_items ON material_sale_items;
CREATE POLICY tenant_branch_isolation_material_sale_items ON material_sale_items USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_employees ON employees;
CREATE POLICY tenant_branch_isolation_employees ON employees USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_employee_work_logs ON employee_work_logs;
CREATE POLICY tenant_branch_isolation_employee_work_logs ON employee_work_logs USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_employee_salary_payments ON employee_salary_payments;
CREATE POLICY tenant_branch_isolation_employee_salary_payments ON employee_salary_payments USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_suppliers ON suppliers;
CREATE POLICY tenant_branch_isolation_suppliers ON suppliers USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_supplier_purchases ON supplier_purchases;
CREATE POLICY tenant_branch_isolation_supplier_purchases ON supplier_purchases USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
DROP POLICY IF EXISTS tenant_branch_isolation_supplier_payments ON supplier_payments;
CREATE POLICY tenant_branch_isolation_supplier_payments ON supplier_payments USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), ''))) WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '') AND (NULLIF(current_setting('app.current_role', true), '') = 'master_admin' OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')));
