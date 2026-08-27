import sys

with open('components/Orders.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(r"\'0\'", "'0'")

with open('components/Orders.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

with open('components/OrderForm.tsx', 'r', encoding='utf-8') as f:
    text2 = f.read()

text2 = text2.replace(r"\'0\'", "'0'")

with open('components/OrderForm.tsx', 'w', encoding='utf-8') as f:
    f.write(text2)
