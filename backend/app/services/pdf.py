from __future__ import annotations

from decimal import Decimal
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from backend.app.core.config import get_settings
from backend.app.models import Customer, Order
from backend.app.services.sms import calculate_order_balance, calculate_order_total, calculate_paid_total


settings = get_settings()


def render_invoice_pdf(order: Order, customer: Customer) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 40
    y = height - margin
    branch_name = order.branch_rel.name if getattr(order, "branch_rel", None) else None
    branch_address = order.branch_rel.address if getattr(order, "branch_rel", None) else None
    branch_phone = order.branch_rel.phone if getattr(order, "branch_rel", None) else None

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(margin, y, settings.invoice_company_name)
    y -= 26

    pdf.setFont("Helvetica", 10)
    if branch_address:
        pdf.drawString(margin, y, branch_address)
        y -= 14
    if branch_phone:
        pdf.drawString(margin, y, f"Phone: {branch_phone}")
        y -= 14
    if branch_name and not branch_address and not branch_phone:
        pdf.drawString(margin, y, branch_name)
        y -= 14
    pdf.drawString(margin, y, f"Invoice: {order.order_number}")
    y -= 14
    pdf.drawString(margin, y, f"Customer: {customer.name}")
    y -= 14
    pdf.drawString(margin, y, f"Phone: {customer.phone or '-'}")
    y -= 14
    pdf.drawString(margin, y, f"Order Date: {order.order_date.isoformat()}")
    y -= 14
    pdf.drawString(margin, y, f"Due Date: {order.due_date.isoformat() if order.due_date else '-'}")
    y -= 14
    pdf.drawString(margin, y, f"Status: {order.status.value}")
    y -= 24

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(margin, y, "Item")
    pdf.drawString(margin + 190, y, "Qty")
    pdf.drawString(margin + 240, y, "Unit")
    pdf.drawString(margin + 310, y, "Amount")
    y -= 10
    pdf.line(margin, y, width - margin, y)
    y -= 16

    pdf.setFont("Helvetica", 10)
    gross = Decimal("0.00")
    for idx, item in enumerate(order.items):
        cloth_size = Decimal(getattr(item, 'cloth_size', 0) or 0)
        price_per_unit = Decimal(getattr(item, 'price_per_unit', 0) or 0)
        quantity = Decimal(getattr(item, 'quantity', 1) or 1)
        stitch_fee = Decimal(getattr(item, 'stitch_fee', 0) or 0)

        material_cost = cloth_size * price_per_unit * quantity
        stitch_cost = stitch_fee * quantity
        line_total = material_cost + stitch_cost
        unit_price = line_total / quantity if quantity > 0 else Decimal("0.00")

        gross += line_total
        pdf.drawString(margin, y, item.dress_type)
        pdf.drawRightString(margin + 225, y, str(item.quantity))
        pdf.drawRightString(margin + 300, y, f"{unit_price:.2f}")
        pdf.drawRightString(width - margin, y, f"{line_total:.2f}")
        y -= 16
        if y < 120:
            pdf.showPage()
            y = height - margin

    paid = calculate_paid_total(order)
    net = calculate_order_total(order)
    balance = calculate_order_balance(order)

    y -= 10
    pdf.line(margin, y, width - margin, y)
    y -= 18
    pdf.drawRightString(width - margin - 100, y, "Gross")
    pdf.drawRightString(width - margin, y, f"{gross:.2f}")
    y -= 16
    pdf.drawRightString(width - margin - 100, y, "Discount")
    pdf.drawRightString(width - margin, y, f"{Decimal(order.discount):.2f}")
    y -= 16
    pdf.drawRightString(width - margin - 100, y, "Net")
    pdf.drawRightString(width - margin, y, f"{net:.2f}")
    y -= 16
    pdf.drawRightString(width - margin - 100, y, "Paid")
    pdf.drawRightString(width - margin, y, f"{paid:.2f}")
    y -= 16
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawRightString(width - margin - 100, y, "Balance")
    pdf.drawRightString(width - margin, y, f"{balance:.2f}")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
