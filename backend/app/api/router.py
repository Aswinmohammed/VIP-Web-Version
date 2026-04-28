from fastapi import APIRouter

from backend.app.api.routers import auth, branches, customers, employees, expenses, inventory, material_sales, orders, reports, sms, suppliers, users


api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(branches.router)
api_router.include_router(users.router)
api_router.include_router(customers.router)
api_router.include_router(orders.router)
api_router.include_router(inventory.router)
api_router.include_router(expenses.router)
api_router.include_router(material_sales.router)
api_router.include_router(employees.router)
api_router.include_router(suppliers.router)
api_router.include_router(reports.router)
api_router.include_router(sms.router)
