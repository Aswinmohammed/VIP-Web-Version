import sys
import re

with open('components/Orders.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(
    r'#\{\s*String\(\s*index\s*\+\s*1\s*\)\.padStart\(2, \'0\'\)\s*\}', 
    r'#{ String(item.itemIndex !== undefined ? item.itemIndex + 1 : index + 1).padStart(2, \'0\') }', 
    text
)
text = re.sub(
    r'#\{\s*String\(\s*idx\s*\+\s*1\s*\)\.padStart\(2, \'0\'\)\s*\}', 
    r'#{ String(item.itemIndex !== undefined ? item.itemIndex + 1 : idx + 1).padStart(2, \'0\') }', 
    text
)

with open('components/Orders.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
