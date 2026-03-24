import os

files = [
    r'e:\workplace\musubi-tuner-ui\frontend\static\index.html',
    r'e:\workplace\musubi-tuner-ui\frontend\static\app.js'
]

replacements = [
    ('E:/workplace/musubi-tuner', '/musubi-tuner'),
    ('C:/Users/wades/.conda/envs/musubi/python.exe', '/usr/local/bin/python'),
    ('C:/Users/wades/.conda/envs/', '/usr/local/bin/python'),
    ('E:/outputs/wan22', '/outputs/wan22'),
    ('E:/models/wan22', '/models/wan22'),
    ('E:/models/zimage', '/models/zimage'),
    ('E:/outputs', '/outputs'),
    ('E:/datasets/wan22', '/datasets/wan22'),
    ('E:/datasets/zimage', '/datasets/zimage'),
    ('E:/datasets', '/datasets')
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    for old, new in replacements:
        content = content.replace(old, new)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print(f"Updated paths in {files}")
