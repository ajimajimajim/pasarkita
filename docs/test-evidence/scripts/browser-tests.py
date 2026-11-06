# Structured browser (end-to-end) test cases for the report. Run on a freshly seeded DB.
import sys, re, json, time, urllib.request
from playwright.sync_api import sync_playwright

B = 'http://localhost:3000'
OUT = sys.argv[1]
cases = []
errors = []

def tc(module, condition, expected, ok, actual):
    cases.append({'id': f'TC-U{len(cases)+1:02d}', 'module': module, 'condition': condition,
                  'expected': expected, 'actual': actual, 'pass': bool(ok)})

def watch(pg):
    pg.on('pageerror', lambda e: errors.append(f'pageerror {e}'))
    pg.on('console', lambda m: errors.append(f'console {m.text} @ page={pg.url.replace(B, "")} resource={m.location.get("url", "").replace(B, "")}') if m.type == 'error' else None)

def login(pg, u):
    pg.goto(B + '/404.html'); pg.evaluate('localStorage.clear()')
    pg.goto(B + '/login.html'); pg.fill('#username', u); pg.fill('#password', 'Password123!'); pg.click('button[type=submit]')
    pg.wait_for_url(re.compile(r'.*/(organizer|vendor)/dashboard\.html')); pg.wait_for_selector('.pm-lot')

def api(path):
    return json.load(urllib.request.urlopen(B + '/api' + path))

def api_get_profile_phone():
    req = urllib.request.Request(B + '/api/auth/login', data=json.dumps({'username': 'organizer1', 'password': 'Password123!'}).encode(), headers={'Content-Type': 'application/json'})
    tok = json.load(urllib.request.urlopen(req))['token']
    req = urllib.request.Request(B + '/api/profile', headers={'Authorization': f'Bearer {tok}'})
    return json.load(urllib.request.urlopen(req))['phone']

def confirm(pg, note=None):
    pg.wait_for_selector('.modal')
    if note: pg.fill('.modal textarea', note)
    pg.click('.modal [data-act=yes]')

STATE = {'st-available': 'Available (green)', 'st-pending': 'Has applicants (yellow)', 'st-taken': 'Taken (red)', 'st-mine': 'Your lot (blue)', 'st-minepending': 'You applied (light blue, dashed)', 'st-closed': 'Not open (grey)'}
def cls(pg, text):
    return pg.locator('.pm-lot', has_text=text).first.get_attribute('class')
def state(pg, text):
    c = cls(pg, text).split()
    return f'{text} drawn as ' + next((v for k, v in STATE.items() if k in c), '?')

events = api('/events'); E2 = events[1]['event_id']; E3 = events[2]['event_id']

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    pg = b.new_page(viewport={'width': 1440, 'height': 950}); watch(pg)

    # ---------- Login routing ----------
    pg.goto(B + '/login.html'); pg.fill('#username', 'organizer1'); pg.fill('#password', 'wrong'); pg.click('button[type=submit]')
    pg.wait_for_selector('.notice-error')
    tc('Login', 'Type a wrong password on the login page', 'Red message "Wrong username or password." and stays on login page',
       'Wrong username or password' in pg.inner_text('#msg') and 'login.html' in pg.url, pg.inner_text('#msg').strip())
    login(pg, 'organizer1')
    tc('Login', 'Log in as organizer1', 'Opens the organizer dashboard', '/organizer/dashboard.html' in pg.url, pg.url.replace(B, ''))
    pg.goto(B + '/vendor/dashboard.html'); pg.wait_for_url('**/organizer/dashboard.html'); pg.wait_for_selector('.pm-lot')
    tc('Login', 'While logged in as organizer, type the vendor dashboard address /vendor/dashboard.html', 'Vendor page is refused; user is returned to the organizer dashboard', pg.url.endswith('/organizer/dashboard.html') and 'Organizer' in pg.inner_text('.role-chip'), pg.url.replace(B, ''))

    # ---------- Map editor ----------
    login(pg, 'organizer1')
    pg.goto(f'{B}/organizer/map-editor.html?event={E3}'); pg.wait_for_selector('.pm-lot')
    before = {l['lot_number']: l for l in api(f'/events/{E3}/map')['lots']}
    g1 = pg.locator('.pm-lot', has_text='G1'); box = g1.bounding_box(); layer = pg.locator('.pmap-layer').bounding_box()
    pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); pg.mouse.down()
    pg.mouse.move(box['x'] + box['width'] / 2 - layer['width'] * 0.10, box['y'] + box['height'] / 2 + layer['height'] * 0.05, steps=8); pg.mouse.up()
    x_after = float(pg.input_value('#props [name=x]'))
    tc('Map editor', 'Drag lot G1 about 10% of the map width to the left', f'X position changes from {before["G1"]["pos_x"]}% to about {before["G1"]["pos_x"] - 10}%; "Save map" becomes clickable',
       abs(x_after - (before['G1']['pos_x'] - 10)) <= 1 and pg.is_enabled('#saveBtn'), f'X = {x_after}%; Save map enabled = {pg.is_enabled("#saveBtn")}')
    h = pg.locator('.pm-lot.is-selected .pm-handle').bounding_box()
    pg.mouse.move(h['x'] + 3, h['y'] + 3); pg.mouse.down()
    pg.mouse.move(h['x'] + 3 + layer['width'] * 0.04, h['y'] + 3 + layer['height'] * 0.04, steps=6); pg.mouse.up()
    w_after = float(pg.input_value('#props [name=w]'))
    tc('Map editor', 'Drag the white corner handle of G1 outwards by about 4%', f'Width grows from {before["G1"]["width"]}% to about {before["G1"]["width"] + 4}%',
       w_after >= before['G1']['width'] + 3, f'Width = {w_after}%')
    pg.fill('#props [name=size_label]', '12ft x 12ft'); pg.fill('#props [name=price]', '55')
    pg.click('#addLotBtn')
    tc('Map editor', 'Click "+ Add lot"', 'A new lot appears with the next free number (L15) and is selected', pg.input_value('#props [name=lot_number]') == 'L15', f'New lot number = {pg.input_value("#props [name=lot_number]")}')
    pg.fill('#props [name=lot_number]', 'X1'); pg.fill('#props [name=zone]', 'Special')
    pg.click('.palette-btn[data-type=stage]')
    tc('Map editor', 'Click the "Stage" facility button', 'A stage icon is placed on the map', pg.locator('.pm-fac.fac-stage').count() == 1, f'{pg.locator(".pm-fac.fac-stage").count()} stage on map')
    pg.click('#saveBtn'); pg.wait_for_selector('text=All changes saved')
    after = {l['lot_number']: l for l in api(f'/events/{E3}/map')['lots']}
    ok = 'X1' in after and after['X1']['zone'] == 'Special' and after['G1']['lot_id'] == before['G1']['lot_id'] and after['G1']['pos_x'] < before['G1']['pos_x'] and after['G1']['size_label'] == '12ft x 12ft' and after['G1']['price'] == 55
    tc('Map editor', 'Click "Save map", then reload the data from the server', 'G1 keeps its ID with new position, size label and RM55 price; X1 saved in zone "Special"',
       ok, f'G1 x={after["G1"]["pos_x"]}%, w={after["G1"]["width"]}%, size="{after["G1"]["size_label"]}", RM{after["G1"]["price"]}; X1 zone="{after.get("X1", {}).get("zone")}"')
    pg.locator('.pm-lot', has_text='R1').click(); pg.keyboard.press('Delete'); pg.wait_for_timeout(200)
    tc('Map editor', 'Select lot R1 (has an applicant) and press Delete', 'Lot stays; error message explains why', pg.locator('.pm-lot', has_text='R1').count() == 1 and "can't be deleted" in pg.inner_text('#toasts'), pg.inner_text('#toasts').strip().split('\n')[-1])
    pg.locator('.pm-lot', has_text='X1').click(); pg.click('#delBtn')
    gone = pg.locator('.pm-lot', has_text='X1').count() == 0
    pg.click('#discardBtn'); confirm(pg)
    tc('Map editor', 'Delete free lot X1, then click "Undo changes"', 'X1 disappears, then comes back after undo', gone and pg.locator('.pm-lot', has_text='X1').count() == 1, f'after delete: {"gone" if gone else "still there"}; after undo: {pg.locator(".pm-lot", has_text="X1").count()} on map')
    pg.set_input_files('#mapFile', '/home/claude/pasarkita/frontend/assets/img/demo-venue.png'); pg.wait_for_timeout(800)
    url = api(f'/events/{E3}/map')['event']['map_image_url'] or ''
    tc('Map editor', 'Upload a venue picture (PNG)', 'Picture becomes the map background and is saved', url.startswith('/uploads/maps/'), f'map_image_url = {url}')

    # ---------- Vendor applies ----------
    login(pg, 'vendor6')
    pg.locator('.event-card', has_text='Weekend Family Bazaar').click(); pg.wait_for_timeout(500)
    pg.locator('.pm-lot', has_text='R6').click(); pg.wait_for_url('**/vendor/apply.html?lot=*'); pg.wait_for_selector('#applyForm')
    tc('Vendor dashboard', 'vendor6 opens the Weekend Family Bazaar map and clicks free lot R6', 'Goes straight to the apply page for R6', 'apply.html' in pg.url and 'Lot R6' in pg.inner_text('#page'), pg.url.replace(B, ''))
    pg.fill('#notes', 'Need shade'); pg.click('#applyForm button[type=submit]')
    pg.wait_for_url('**/vendor/applications.html?applied=1'); pg.wait_for_selector('.app-card')
    tc('Stall application', 'Submit the application form for R6', 'Applications page shows R6 as Pending', pg.locator('.app-card.s-pending', has_text='R6').count() == 1, f'{pg.locator(".app-card.s-pending").count()} pending card(s); R6 shown')
    pg.goto(f'{B}/vendor/dashboard.html?event={E2}'); pg.wait_for_selector('.pm-lot')
    tc('Vendor dashboard', 'Return to the map', 'R6 is drawn as "You applied" (light blue, dashed border)', 'st-minepending' in cls(pg, 'R6'), state(pg, 'R6'))
    pg.locator('.pm-lot', has_text='R5').click(); pg.wait_for_timeout(200)
    lp = ' '.join(pg.inner_text('#lotPanel').split())
    tc('Vendor dashboard', 'Click another free lot (R5) in the same event', 'Stays on the map; panel says she already applied for R6', 'dashboard.html' in pg.url and 'already applied' in lp, 'Panel: "' + lp[lp.find('You already'):] + '"')

    # ---------- Organizer accepts on the map ----------
    login(pg, 'organizer1')
    pg.locator('.event-card', has_text='Weekend Family Bazaar').click(); pg.wait_for_timeout(500)
    badge = pg.locator('.pm-lot', has_text='R6').locator('.pm-badge')
    tc('Organizer dashboard', 'Organizer opens the same event map', 'R6 is yellow with a red "1" applicant badge', badge.count() == 1 and badge.inner_text() == '1' and 'st-pending' in cls(pg, 'R6'), f'badge = "{badge.inner_text() if badge.count() else "none"}"; {state(pg, "R6")}')
    pg.locator('.pm-lot', has_text='R6').click(); pg.wait_for_selector('#applicants .applicant')
    ap = ' '.join(pg.inner_text('#applicants').split()); nacc = pg.locator('#applicants [data-accept]').count(); nrej = pg.locator('#applicants [data-reject]').count()
    tc('Organizer dashboard', 'Click lot R6', 'Side panel lists Farah Batik with her note "Need shade" and Accept/Reject buttons', 'Farah Batik' in ap and 'Need shade' in ap and nacc == 1 and nrej == 1, f'Panel: "{ap[ap.find("Farah Batik"):][:130]}"; Accept buttons: {nacc}, Reject buttons: {nrej}')
    pg.click('#applicants [data-accept]'); confirm(pg, 'Welcome!'); pg.wait_for_selector('text=Vendor on this lot')
    tc('Organizer dashboard', 'Click Accept and confirm with note "Welcome!"', 'R6 turns red (taken); panel shows Farah as the vendor on the lot', 'st-taken' in cls(pg, 'R6'), state(pg, 'R6'))

    # ---------- Vendor: pay, helper, attendance, relocation ----------
    login(pg, 'vendor6')
    pg.goto(B + '/vendor/applications.html'); pg.wait_for_selector('.pay-form')
    pg.set_input_files('.pay-form input[type=file]', '/home/claude/pasarkita/database/demo-receipt.png'); pg.click('.pay-form button'); pg.wait_for_timeout(800)
    card = pg.locator('.app-card.s-accepted', has_text='R6')
    paysec = card.locator('.section-line').nth(0); paytxt = ' '.join(paysec.inner_text().split()); nlink = paysec.locator('a', has_text='receipt').count()
    tc('Payment', 'Upload a receipt with the pre-filled amount (RM60.00) and click Pay', 'Payment shows Pending, RM 60.00, with a receipt link', 'Pending' in paytxt and 'RM 60.00' in paytxt and nlink == 1, f'Payment section: "{paytxt}"; receipt links: {nlink}')
    pg.select_option('.help-form select', 'trolley'); pg.fill('.help-form input[type=time]', '07:20'); pg.fill('.help-form input[name=notes]', 'Display racks')
    pg.click('.help-form button'); pg.wait_for_timeout(800)
    helptxt = ' '.join(card.locator('.section-line').nth(2).locator('table').inner_text().split())
    tc('Helper management', 'Request a trolley helper for 7:20 AM', 'Request listed under Helpers as Trolley, 7:20 AM, Pending', 'trolley' in helptxt.lower() and '7:20 AM' in helptxt and 'Pending' in helptxt, f'Helpers table: "{helptxt}"')
    pg.goto(B + '/vendor/next-event.html'); pg.wait_for_selector('#attForm')
    pg.fill('#arrivalTime', '06:45'); pg.click('#attForm button'); pg.wait_for_timeout(700)
    att = ' '.join(pg.locator('#attForm p', has_text='Current status').inner_text().split())
    tc('Next event', 'On Next Event, choose "Yes, I\'m coming", set arrival 6:45 AM and save', 'Status changes to Attending, 6:45 AM', 'Attending' in att and '6:45 AM' in att, f'Page shows: "{att}"')
    pg.goto(B + '/vendor/applications.html'); pg.wait_for_selector('.app-card.s-accepted')
    pg.locator('.app-card.s-accepted', has_text='R6').locator('text=Request relocation').click()
    pg.wait_for_url('**/vendor/relocate.html?app=*'); pg.wait_for_selector('.pm-lot')
    pg.locator('.pm-lot', has_text='R4').click(); pg.wait_for_timeout(200)
    taken_blocked = pg.is_disabled('#sendBtn')
    pg.locator('.pm-lot', has_text='R3').click(); pg.fill('#reason', 'Nearer the road')
    tc('Relocation', 'On the relocation map, click taken lot R4, then free lot R3', 'R4 is refused (button stays disabled); R3 is accepted as the new lot', taken_blocked and pg.is_enabled('#sendBtn'), f'after R4: send disabled = {taken_blocked}; after R3: send enabled = {pg.is_enabled("#sendBtn")}')
    pg.click('#sendBtn'); pg.wait_for_url('**/applications.html?relocated=1'); pg.wait_for_selector('.app-card')
    reltxt = ' '.join(pg.locator('.app-card', has_text='Weekend Family Bazaar').locator('.section-line').nth(1).inner_text().split())
    tc('Relocation', 'Send the relocation request', 'Applications page shows Pending R6 → R3', 'R6 → R3' in reltxt and 'Pending' in reltxt, f'Relocation section: "{reltxt}"')

    # ---------- Organizer: requests page ----------
    login(pg, 'organizer1')
    pg.goto(B + '/organizer/requests.html?tab=payments'); pg.wait_for_selector('[data-verify]')
    nbefore = pg.locator('[data-verify]').count(); pg.locator('tr', has_text='Farah Batik').locator('[data-verify]').click(); pg.wait_for_timeout(700)
    tc('Requests page', 'Payments tab: click Verify on Farah\'s payment', 'Payment leaves the waiting list', pg.locator('[data-verify]').count() == nbefore - 1, f'waiting payments {nbefore} → {pg.locator("[data-verify]").count()}')
    pg.click('.tab[data-tab=relocations]'); pg.wait_for_selector('tbody tr')
    pg.locator('tr', has_text='Farah Batik').locator('[data-approve]').click(); confirm(pg); pg.wait_for_timeout(700)
    m2 = {l['lot_number']: l for l in api(f'/events/{E2}/map')['lots']}
    tc('Requests page', 'Relocations tab: approve Farah\'s move R6 → R3', 'Farah is on R3 and R6 is free', m2['R3']['vendor_name'] == 'Farah Batik' and not m2['R6']['vendor_id'], f'R3 = {m2["R3"]["vendor_name"]}; R6 = {m2["R6"]["vendor_name"] or "free"}')
    pg.click('.tab[data-tab=helpers]'); pg.wait_for_selector('tbody tr')
    pg.locator('tr', has_text='Farah Batik').locator('[data-assign]').click(); pg.wait_for_timeout(700)
    pg.click('#showAll'); pg.wait_for_timeout(600)
    rowloc = pg.locator('tr', has_text='Farah Batik').first; row = rowloc.inner_text(); st = ' '.join(rowloc.locator('td').nth(3).inner_text().split())
    tc('Requests page', 'Helpers tab: assign the first available helper to Farah', 'Request status becomes Assigned with the helper\'s name', 'Assigned' in row, f'Status cell: {st}')
    pg.click('.tab[data-tab=applications]'); pg.wait_for_timeout(500); pg.uncheck('#showAll'); pg.wait_for_timeout(600)
    nb = pg.locator('tr', has_text='Nurul Burger').count(); pg.locator('tr', has_text='Nurul Burger').locator('[data-reject]').click(); confirm(pg, 'Zone full'); pg.wait_for_timeout(700)
    na = pg.locator('tr', has_text='Nurul Burger').count(); lt = pg.locator('#toasts .toast').last.inner_text()
    tc('Requests page', 'Applications tab: reject Nurul Burger Bakar with note "Zone full"', 'Application leaves the waiting list', na == 0, f'Nurul Burger rows in pending list: {nb} → {na}; message: "{lt}"')

    # ---------- Reports, events, profile ----------
    pg.goto(B + '/organizer/reports.html'); pg.wait_for_selector('#eventSelect option', state='attached'); pg.click('#genBtn'); pg.wait_for_selector('.stat')
    tiles = ' | '.join(' '.join(t.split()) for t in pg.locator('.stat').all_inner_texts()[:2])
    tc('Reports', 'Reports page: generate the report for today\'s event', 'Shows 4/14 lots taken and RM 140.00 verified', '4/14' in pg.inner_text('#report') and 'RM 140.00' in pg.inner_text('#report'), f'First two tiles: "{tiles}"')
    tc('Reports', 'After generating, check the Print button', 'Print button becomes clickable', pg.is_enabled('#printBtn'), f'Print enabled = {pg.is_enabled("#printBtn")}')
    pg.goto(B + '/organizer/events.html'); pg.wait_for_selector('#rows tr')
    pg.fill('#name', 'UI Test Market'); pg.fill('#eventDate', '2099-05-05'); pg.fill('#location', 'Test Place'); pg.fill('#startTime', '09:00'); pg.fill('#endTime', '13:00')
    pg.click('#saveBtn'); pg.wait_for_url('**/map-editor.html?event=*'); pg.wait_for_timeout(500)
    tc('Event management', 'Create event "UI Test Market"', 'Opens the map editor for the new event with an empty map', pg.locator('.pm-lot').count() == 0, f'{pg.locator(".pm-lot").count()} lots on new map')
    pg.select_option('#copySelect', index=1); confirm(pg); pg.wait_for_timeout(400)
    copied = pg.locator('.pm-lot').count()
    pg.click('#saveBtn'); pg.wait_for_selector('text=All changes saved')
    saved = len(api('/events/' + pg.url.split('event=')[1] + '/map')['lots'])
    tc('Event management', 'Use "Copy layout from…" to copy another event\'s map, then save', 'All copied lots are saved to the new event', copied >= 14 and saved == copied, f'{copied} lots copied, {saved} saved')
    pg.goto(B + '/organizer/profile.html'); pg.wait_for_selector('#profileForm')
    pg.fill('#phone', '012-999 0000'); pg.click('#profileForm button'); pg.wait_for_timeout(500)
    lt = pg.locator('#toasts .toast').last.inner_text(); saved_phone = api_get_profile_phone()
    tc('Profile', 'Organizer changes phone number on My Profile', 'Message "Profile saved." appears and the new number is stored', 'Profile saved' in lt and saved_phone == '012-999 0000', f'Message: "{lt}"; stored phone: {saved_phone}')
    # D6 check: the Edit button must fill the form
    pg.goto(B + '/organizer/events.html'); pg.wait_for_selector('#rows [data-edit]')
    row = pg.locator('#rows tr').filter(has=pg.locator('[data-edit]')).first
    ename = row.locator('td').first.locator('b').inner_text()
    row.locator('[data-edit]').click(); pg.wait_for_timeout(300)
    got = pg.input_value('#name'); gdate = pg.input_value('#eventDate')
    tc('Event management', f'Events page: click Edit on "{ename}"', 'The form fills with that event\'s name and date (check for defect D6)', got == ename and gdate != '', f'Name box = "{got}"; date box = {gdate}')
    b.close()

json.dump({'cases': cases, 'js_errors': errors}, open(OUT, 'w'), indent=2)
bad = [c for c in cases if not c['pass']]
print(f'{len(cases)} cases, {len(cases)-len(bad)} passed, {len(bad)} failed; JS errors: {len(errors)}')
for c in bad: print('FAIL', c['id'], c['condition'], '|', c['actual'])
for e in errors: print('JSERR', e)
