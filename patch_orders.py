import sys

with open('backend/app/api/routers/orders.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    '\"price_per_unit\": item.price_per_unit,',
    '\"price_per_unit\": item.price_per_unit,\n                \"item_index\": item.item_index,'
)

text = text.replace(
    'price_per_unit=item_payload.price_per_unit,',
    'price_per_unit=item_payload.price_per_unit,\n            item_index=item_payload.item_index,'
)

with open('backend/app/api/routers/orders.py', 'w', encoding='utf-8') as f:
    f.write(text)
