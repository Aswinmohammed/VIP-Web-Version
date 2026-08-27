import sys

with open('components/DressQuantityTracker.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(
    'aria-label={Mark  # as complete}',
    'aria-label={Mark  # as complete}'
)

with open('components/DressQuantityTracker.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
