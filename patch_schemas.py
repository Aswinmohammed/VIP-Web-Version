import sys

with open('backend/app/schemas.py', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    'price_per_unit: Decimal = Field(ge=0)',
    'price_per_unit: Decimal = Field(ge=0)\n    item_index: int = 0'
)

text = text.replace(
    'price_per_unit: Decimal',
    'price_per_unit: Decimal\n    item_index: int = 0'
)

with open('backend/app/schemas.py', 'w', encoding='utf-8') as f:
    f.write(text)
