"""Ambil data.json dari index.html yang sedang tayang: python3 build/extract.py index.html data.json"""
import json, sys
x = open(sys.argv[1], encoding='utf8').read(); k = 'window.PJ_DATA = '
a = x.find(k) + len(k); e = x.find('</script>', a)
json.dump(json.loads(x[a:e].strip().rstrip(';')), open(sys.argv[2], 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('ok', sys.argv[2])
