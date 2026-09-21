with open('usb_transfer.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, l in enumerate(lines):
    if '"""' in l:
        print(i+1, repr(l.strip()))
