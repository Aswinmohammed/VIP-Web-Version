import sys

with open('utils/cloudApi.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    'price_per_unit: number;',
    'price_per_unit: number;\n  item_index?: number;'
)

text = text.replace(
    'pricePerUnit: Number(item.price_per_unit),',
    'pricePerUnit: Number(item.price_per_unit),\n    itemIndex: item.item_index ?? i,'
)

text = text.replace(
    'price_per_unit: Number(item.pricePerUnit || 0),',
    'price_per_unit: Number(item.pricePerUnit || 0),\n      item_index: item.itemIndex ?? i,'
)

with open('utils/cloudApi.ts', 'w', encoding='utf-8') as f:
    f.write(text)
