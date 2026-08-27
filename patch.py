import sys

with open('backend/app/main.py', 'r', encoding='utf-8') as f:
    text = f.read()

patch = '''def ensure_order_item_index_column() -> None:
    inspector = inspect(engine)
    if not _table_exists(inspector, "order_items"):
        return
    statements = [
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_index INTEGER NOT NULL DEFAULT 0",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

def ensure_employee_salary_columns() -> None:'''

text = text.replace('def ensure_employee_salary_columns() -> None:', patch)
text = text.replace('ensure_employee_salary_columns()', 'ensure_order_item_index_column()\n    ensure_employee_salary_columns()', 1)

with open('backend/app/main.py', 'w', encoding='utf-8') as f:
    f.write(text)
