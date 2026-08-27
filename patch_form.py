import sys
import re

with open('components/OrderForm.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace addItem logic
old_add_item = '''const addItem = () => {
    const newItem: OrderItem = { id: createClientId('ITEM'), dressType: '', inventoryItemId: '', clothCode: '', clothName: '', clothSize: 0, stitchFee: 0, quantity: 1, pricePerUnit: 0, measurements: [], note: '' };'''

new_add_item = '''const addItem = () => {
    const nextIndex = order.items.length > 0 ? Math.max(...order.items.map(item => item.itemIndex ?? 0)) + 1 : 0;
    const newItem: OrderItem = { id: createClientId('ITEM'), dressType: '', itemIndex: nextIndex, inventoryItemId: '', clothCode: '', clothName: '', clothSize: 0, stitchFee: 0, quantity: 1, pricePerUnit: 0, measurements: [], note: '' };'''

text = text.replace(old_add_item, new_add_item)

# Also patch the item number in OrderForm if it shows it (usually #1, #2)
text = re.sub(r'#\{\s*index\s*\+\s*1\s*\}', r'#{ (item.itemIndex !== undefined ? item.itemIndex + 1 : index + 1) }', text)
text = re.sub(r'#\{\s*String\(\s*idx\s*\+\s*1\s*\)\.padStart\(2, \'0\'\)\s*\}', r'#{ String(item.itemIndex !== undefined ? item.itemIndex + 1 : idx + 1).padStart(2, \'0\') }', text)

with open('components/OrderForm.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
