from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[1]
site=root/'site'
required=[site/'index.html',site/'styles.css',site/'app.js',site/'config.js',site/'data/catalogue.json',root/'.github/workflows/deploy-pages.yml',root/'backend/AppsScript.gs']
missing=[str(p.relative_to(root)) for p in required if not p.exists()]
if missing:
    print('MISSING:', *missing, sep='\n- '); sys.exit(1)
data=json.loads((site/'data/catalogue.json').read_text(encoding='utf-8'))
bad=[]; count=0
for h in data.get('hotels',[]):
    for c in h.get('categories',[]):
        count+=1; url=c.get('menu_url','')
        if url and not url.startswith(('http://','https://')):
            p=site/url
            if not p.exists(): bad.append(f"{h['supplier']} / {c['category']}: {url}")
if bad:
    print('BROKEN LOCAL MENU LINKS:', *bad, sep='\n- '); sys.exit(2)
print(f'OK: {len(data.get("hotels",[]))} hotels, {count} category links, required repo files present.')
