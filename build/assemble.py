"""Rakit index.html: python3 build/assemble.py data.json index.html"""
import json, sys, os
here = os.path.dirname(os.path.abspath(__file__))
data_path, out = sys.argv[1], sys.argv[2]
t = open(os.path.join(here, 'template.html'), encoding='utf8').read()
app = open(os.path.join(here, 'app.js'), encoding='utf8').read()
data = json.dumps(json.load(open(data_path, encoding='utf8')), ensure_ascii=False, separators=(',', ':'))
assert '/*__PJ_DATA__*/' in t and '/*__PJ_APP__*/' in t
open(out, 'w', encoding='utf8').write(t.replace('/*__PJ_DATA__*/', data + ';\n', 1).replace('/*__PJ_APP__*/', app, 1))
print('ok', out, os.path.getsize(out))
