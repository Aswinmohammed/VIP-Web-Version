import sys
import uuid
from sqlalchemy import text
from backend.app.database import SessionLocal, engine
from backend.app.models import User, Branch, Order, OrderItem

try:
    db = SessionLocal()
    users = db.query(User).all()
    print('--- USERS ---')
    for u in users:
        print(f'User: {u.username}, Role: {u.role.value}, BranchID: {u.branch_id}, TenantID: {u.tenant_id}')
        
    branches = db.query(Branch).all()
    print('\n--- BRANCHES ---')
    for b in branches:
        print(f'Branch: {b.name}, ID: {b.id}, Hub: {b.is_production_hub}, TenantID: {b.tenant_id}')
        
    orders = db.query(Order).all()
    print('\n--- ORDERS SUMMARY ---')
    print(f'Total Orders: {len(orders)}')
    if orders:
        print(f'Order 1: {orders[0].order_number}, BranchID: {orders[0].branch_id}, TenantID: {orders[0].tenant_id}')
        
    # Check RLS directly by simulating the session
    if users and branches:
        # Pick the Kalmunai branch if it exists, otherwise first branch
        hub = next((b for b in branches if 'Kalmunai' in b.name), branches[0])
        print(f'\n--- SIMULATING RLS FOR HUB: {hub.name} ---')
        
        with engine.connect() as conn:
            conn.execute(text("SELECT set_config('app.current_tenant_id', :tid, true)"), {'tid': str(hub.tenant_id)})
            conn.execute(text("SELECT set_config('app.current_role', 'branch_admin', true)"))
            conn.execute(text("SELECT set_config('app.current_branch_id', :bid, true)"), {'bid': str(hub.id)})
            conn.execute(text("SELECT set_config('app.is_production_hub', 'true', true)"))
            
            res = conn.execute(text("SELECT count(*) FROM orders")).scalar()
            print(f'Visible Orders via RLS (is_hub=true): {res}')
            
            conn.execute(text("SELECT set_config('app.is_production_hub', 'false', true)"))
            res2 = conn.execute(text("SELECT count(*) FROM orders")).scalar()
            print(f'Visible Orders via RLS (is_hub=false): {res2}')
            
except Exception as e:
    print('Error:', str(e))
