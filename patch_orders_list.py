import sys

with open('components/Orders.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    '<span className="bg-[#111827] text-white rounded-lg w-9 h-9 flex items-center justify-center mr-4 font-black text-sm shadow-md">{index + 1}</span>',
    '<span className="bg-[#111827] text-white rounded-lg w-9 h-9 flex items-center justify-center mr-4 font-black text-sm shadow-md">{item.itemIndex !== undefined ? item.itemIndex + 1 : index + 1}</span>'
)

with open('components/Orders.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
