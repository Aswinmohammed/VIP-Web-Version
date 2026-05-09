import sys
sys.path.append('.')
from backend.app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    res = conn.execute(text("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'order_status'")).fetchall()
    print("order_status values:", res)
    
    res = conn.execute(text("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'orderstatus'")).fetchall()
    print("orderstatus values:", res)
