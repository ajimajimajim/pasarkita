# PasarKita — Pop-Up Market Vendor Movement & Load Assistance System

A website where a pop-up market **organizer** lays out stall lots on a pixel-style venue map, and
**vendors** pick a lot, apply for it, pay, request relocation and ask for load-moving helpers.
The **public** can see today's and upcoming markets without logging in.

- **Stack:** Node.js + Express (backend), MySQL 8 in Docker (database), plain HTML/CSS/JavaScript (frontend).
- **Everything runs at one address:** http://localhost:3000

---

## 1. What you need installed

1. **Node.js 18 or newer** — https://nodejs.org (LTS)
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop (open it and wait until it says *running*)

No Laravel, no PHP, no other services needed.

## 2. First-time setup (about 10 minutes)

Open a terminal in the `pasarkita` folder (the one with `docker-compose.yml`):

```bash
# 1. Start the database
docker compose up -d

# 2. Go into the backend and install packages
cd backend
npm install

# 3. Create your config file
copy .env.example .env        # Windows (PowerShell / CMD)
# cp .env.example .env        # Mac / Linux
#    Open .env and change JWT_SECRET to any long random text.

# 4. Create the tables + demo data
npm run setup

# 5. Start the website
npm start
```

Open **http://localhost:3000**

> The first `docker compose up -d` downloads MySQL and takes a few minutes. If `npm run setup` says
> "Waiting for the database", just let it retry — it waits up to a minute.

## 3. Every time after that

```bash
# in the pasarkita folder
docker compose up -d
cd backend
npm start
```

Stop the website with **Ctrl + C**. Stop the database with `docker compose down`.

## 4. Demo accounts

All passwords: **`Password123!`**

| Who | Username | What they have in the demo |
|---|---|---|
| Organizer | `organizer1` | Everything |
| Vendor | `vendor1` (Kak Siti Kuih) | Lot F1 today, lot G1 in 5 days, applied for R1 in 12 days |
| Vendor | `vendor2` (Ahmad Fresh Fruit) | Lot R1 today, applying for G2 in 5 days |
| Vendor | `vendor3` (Mei Ling Crafts) | Lot R4 in 5 days, asked to relocate to R5, asked for a porter |
| Vendor | `vendor4` (Raju Teh Tarik) | Lot F2 today, also applying for G2 in 5 days |
| Vendor | `vendor5` (Nurul Burger Bakar) | Lot F3 today (payment waiting), applying for R2 |
| Vendor | `vendor6` (Farah Batik) | **Nothing yet** — use her to demo applying from scratch |

### ⚠️ Before your presentation
The demo "happening today" event is dated on the day you run `npm run setup`.
**Run `npm run setup` again on presentation day** so "today" is correct.
This wipes all data and reloads the demo data.

Want an empty system (only `organizer1` and the helpers)? Run `npm run setup -- --empty`.

## 5. What each user can do

### Public (no login) — `http://localhost:3000`
- See today's and upcoming markets, the stall map, and which vendor is on which lot.

### Organizer — sidebar
| Page | What it does |
|---|---|
| **Dashboard** | Today's + upcoming events, live stall map. Click a lot to see **who is applying** and **Accept / Reject** right there. Red number on a lot = number of applicants. |
| **Events** | Create, edit, cancel/restore, delete events. |
| **Map Editor** | Upload a venue picture, then **drag and drop** lots and facilities. Drag the white corner to **resize**. Set lot number, size (e.g. 20ft x 17ft), zone and price. Copy a layout from another event. |
| **Requests** | Tabs for stall applications, relocations, helper requests and payments (accept/reject, assign helpers, verify receipts). |
| **Vendors** | Search, view, edit or delete vendors. |
| **Helpers** | Porter/trolley roster, set available or off duty. |
| **Reports** | Generate an event report, then print it. |
| **My Profile** | Edit name/phone/email, change password. |

### Vendor — sidebar
| Page | What it does |
|---|---|
| **Dashboard** | Same map. Click a **green or yellow** lot → goes to the **apply page**. Your lot is blue. |
| **Applications** | Status of every application. Cancel a pending one. For an accepted lot: **pay + upload receipt**, **request relocation**, **request a helper**. |
| **Next Event** | (a) Confirm you're attending and your arrival/loading time. (b) Choose which upcoming event to join. |
| **My Profile** | Edit business details, change password. |

### Rules the system enforces
- A vendor can have **one** pending or accepted lot per event.
- Vendors can apply only for **upcoming** events (not on the day itself).
- When the organizer accepts one vendor for a lot, the **other applicants for that lot are rejected automatically**.
- Relocation only to a **free** lot in the same event; the organizer must approve.
- A lot that has a vendor or applicants **cannot be deleted** in the map editor.
- Payment needs a receipt (JPG, PNG or PDF, max 5 MB).

## 6. Use case → where it is

| Use case | Page | Backend |
|---|---|---|
| UC1 Manage Vendor Details | Organizer → Vendors | `vendorController.js` |
| UC2 Manage Event Details | Organizer → Events | `eventController.js` |
| UC3 Manage Stall (Lot) Details | Organizer → Map Editor | `eventController.saveLayout` |
| UC4 Manage Payment Details | Organizer → Requests → Payments | `paymentController.review` |
| UC5 Manage Helper Details | Organizer → Helpers, Requests → Helpers | `helperController.js` |
| UC6 Generate Reports | Organizer → Reports | `reportController.generate` |
| UC7 Print Reports («extend» UC6) | Organizer → Reports → Print | `reportController.print` |
| UC8 View Event Details | Public page, dashboards | `eventController.getMap` |
| UC9 Manage Profile Details | My Profile | `profileController.js` |
| UC10 View Stall Details | Vendor dashboard / Applications | `applicationController.getLot` |
| UC11 Make Payment («include» UC12) | Vendor → Applications | `paymentController.create` |
| UC12 Upload Receipt | Vendor → Applications | `middleware/upload.js` |
| UC13 View Payment Status | Vendor → Applications / Next Event | `applicationController.myApplications` |
| UC14 Request Helper | Vendor → Applications | `helperController.createRequest` |
| **New:** Apply for Stall | Vendor → Dashboard → Apply page | `applicationController.apply` |
| **New:** Accept / Reject Application | Organizer → Dashboard lot panel, Requests | `applicationController.decide` |
| **New:** Request Relocation / Approve | Vendor → Relocate page; Organizer → Requests | `relocationController.js` |
| **New:** Confirm Attendance | Vendor → Next Event | `applicationController.setAttendance` |

## 7. Folder structure

```
pasarkita/
├── docker-compose.yml          MySQL database
├── database/demo-receipt.png   sample receipt used by the demo data
├── backend/
│   ├── .env.example            copy to .env
│   ├── src/server.js           starts the website + API
│   ├── src/routes/index.js     every API route in one file
│   ├── src/controllers/        the logic (one file per area)
│   ├── src/middleware/         login check, file uploads, error messages
│   ├── src/config/schema.sql   database tables
│   ├── src/config/setup.js     npm run setup (tables + demo data)
│   └── uploads/                receipts + venue pictures people upload
└── frontend/
    ├── index.html, login.html, register.html
    ├── organizer/              organizer pages
    ├── vendor/                 vendor pages
    └── assets/
        ├── css/style.css       ALL styling (colours at the top)
        ├── js/api.js           API calls, formatting, pop-ups
        ├── js/layout.js        sidebar + top bar
        ├── js/map.js           the pixel map (view + drag/drop editor)
        ├── js/sprites.js       pixel icons (drawn as text grids)
        ├── fonts/              pixel fonts (work offline)
        └── img/demo-venue.png  demo venue picture
```

## 8. Changing the look

- **Colours:** top of `frontend/assets/css/style.css` (`:root { ... }`). Change `--primary`, `--accent`,
  `--sidebar`, and the `--lot-...` colours for the map.
- **Fonts:** `--font-pixel` (headings) and `--font-num` (lot numbers) in the same place.
- **Pixel icons:** `frontend/assets/js/sprites.js` — each icon is a grid of letters; each letter is one pixel.
- Frontend changes show after a browser refresh. Backend changes need a restart (or use `npm run dev`).

## 9. Running the automated tests

```bash
# in the backend folder
npm run setup        # reset to the demo data (the tests expect it)
npm start            # in a second terminal, leave it running
npm run test:api     # runs 91 API test cases and prints PASS/FAIL for each
npm run setup        # reset again afterwards: the tests change the demo data
```
Results are also saved to `backend/tests/api-results.json`.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `JWT_SECRET is missing` | You haven't created `backend/.env`. See step 3. |
| "Cannot reach the database" / `ECONNREFUSED` | Docker Desktop isn't running, or the database is still starting. Run `docker compose ps`. |
| "Database tables are missing" | Run `npm run setup`. |
| Port 3306 already in use | XAMPP/another MySQL is running. Stop it, **or** change `"3306:3306"` to `"3307:3306"` in `docker-compose.yml` and set `DB_PORT=3307` in `.env`. |
| Port 3000 already in use | Change `PORT` in `.env`. |
| Login fails for demo users | Run `npm run setup` again. |

### Using XAMPP instead of Docker
Start MySQL in XAMPP, then in `backend/.env` set `DB_USER=root` and `DB_PASSWORD=` (empty).
`npm run setup` creates the `pasarkita` database for you. Skip the `docker compose` commands.
