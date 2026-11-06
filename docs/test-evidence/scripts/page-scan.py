import sys, re, json, urllib.request
from playwright.sync_api import sync_playwright
B='http://localhost:3000'; OUT=sys.argv[1]
def api(path, token=None):
    req = urllib.request.Request(B+'/api'+path, headers={'Authorization': f'Bearer {token}'} if token else {})
    return json.load(urllib.request.urlopen(req))
def tok(u):
    req = urllib.request.Request(B+'/api/auth/login', data=json.dumps({'username':u,'password':'Password123!'}).encode(), headers={'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(req))['token']
ev = api('/events'); E2 = ev[1]['event_id']
v1 = tok('vendor1'); apps = api('/applications/mine', v1)
reloc_app = next(a for a in apps if a['event_id']==E2 and a['status']=='accepted')['application_id']
free_lot = next(l for l in api(f'/events/{E2}/map')['lots'] if not l['vendor_id'])['lot_id']
pages = {
 None: ['/index.html','/login.html','/register.html','/404.html'],
 'organizer1': ['/organizer/'+p+'.html' for p in ['dashboard','events','map-editor','requests','vendors','helpers','reports','profile']],
 'vendor6': ['/vendor/dashboard.html', f'/vendor/apply.html?lot={free_lot}', '/vendor/applications.html', '/vendor/next-event.html', '/vendor/profile.html'],
 'vendor1': [f'/vendor/relocate.html?app={reloc_app}'],
}
rows=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    for vp_name, vp in [('Desktop 1440x950', {'width':1440,'height':950}), ('Phone 390x844', {'width':390,'height':844})]:
        for user, plist in pages.items():
            ctx=b.new_context(viewport=vp); pg=ctx.new_page()
            errs=[]
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
            if user:
                pg.goto(B+'/login.html'); pg.fill('#username',user); pg.fill('#password','Password123!'); pg.click('button[type=submit]')
                pg.wait_for_url(re.compile(r'.*/(organizer|vendor)/dashboard\.html')); pg.wait_for_timeout(500)
            for path in plist:
                errs.clear()
                pg.goto(B+path); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(400)
                timing = pg.evaluate("(() => { const n = performance.getEntriesByType('navigation')[0]; return Math.round(n.loadEventEnd - n.startTime); })()")
                over = pg.evaluate('document.documentElement.scrollWidth > window.innerWidth')
                rows.append({'viewport':vp_name,'page':path.split('?')[0],'role':'organizer' if user=='organizer1' else 'vendor' if user else 'public',
                             'final_url':pg.url.replace(B,'').split('?')[0],'console_errors':len(errs),'horizontal_scroll':over,'load_ms':timing})
            ctx.close()
    b.close()
json.dump(rows, open(OUT,'w'), indent=2)
print(len(rows),'page loads; errors:',sum(r['console_errors'] for r in rows),'; horizontal scroll:',sum(r['horizontal_scroll'] for r in rows))
for r in rows:
    if r['final_url']!=r['page'] or r['console_errors'] or r['horizontal_scroll']: print('CHECK', r)
print('load ms desktop:', sorted(r['load_ms'] for r in rows if r['viewport'].startswith('Desktop')))
