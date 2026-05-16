import sys
from sqlalchemy import text
from backend.app.database import SessionLocal, engine
from backend.app.models import Branch, Order

try:
    db = SessionLocal()
    branches = db.query(Branch).all()
    print('--- BRANCHES ---')
    for b in branches:
        print(f'Branch: {b.name}, ID: {b.id}')
        
    print('\n--- ORDER COUNTS PER BRANCH ---')
    for b in branches:
        count = db.query(Order).filter(Order.branch_id == b.id).count()
        print(f'{b.name}: {count} orders')
        
except Exception as e:
    print('Error:', str(e))
