# RestaurantHub — Restaurant Management System (V1)

A multi-branch Restaurant Management System delivered as a **single project**:
one Vite + React + Tailwind frontend, one Supabase project (Postgres + Auth + RLS +
Realtime), differentiated by route and user role.

- `https://restaurant.com` → **Customer website** (public storefront, no login)
- `https://restaurant.com/admin` → **Staff portal** (login-gated, role-aware)

## Tech stack

- Frontend: Vite + React (JSX)
- Styling: Tailwind CSS
- Backend/Database/Auth: Supabase (Postgres, Auth, Row-Level Security, Realtime)
- Routing: React Router — public routes at root, a separate tree under `/admin`

## Quick start

```bash
npm install

# Configure Supabase
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Create the database

# 1. Open Supabase Dashboard -> SQL Editor
# 2. Run the whole file: supabase/schema.sql  (fresh install)
# 3. Already deployed? Instead of schema.sql, run the incremental migrations
#    in supabase/migrations/ in order (001 -> 005).

npm run dev
```

The schema file creates all tables, RLS policies, helper functions and seeds a demo
branch with sample categories, menu items and tables. See `.env.example` for
bootstrap instructions (including how to create your first owner account).

## V1.1 features

- **Role-based login redirect** — after sign-in every role lands on its own
  configurable screen (Owner/Admin → Dashboard, Manager → Dashboard, Cashier →
  POS/Billing, Waiter → Order Screen, Kitchen → Kitchen Display). The routes are
  stored in `role_default_routes` and editable in `Admin → Settings` without
  touching app code.
- **Kitchen required products** — `menu_items.requires_kitchen` marks items that
  need kitchen prep. Kitchen items flow into the Kitchen Display; non-kitchen
  items are marked ready immediately. Mixed orders send only kitchen items to
  the kitchen.
- **Kitchen Display with ETA** — kitchen tickets show order, table, customer,
  items and an estimated prep time (default 5 minutes) with `Start Preparing`,
  `+1/+2/+5` and `Ready` controls. ETA changes push to the POS in real time.
- **Branch-wise payment methods** — `payment_methods` + `branch_payment_methods`
  let every branch choose which methods its cashiers can accept (Cash, Card,
  bKash, Nagad, Rocket, Bank Transfer, QR, UPI…). Configured in
  `Admin → Payment Methods`; the POS payment screen loads them dynamically.
- **Customer invoice printing** — after payment, a thermal-receipt invoice
  (58mm/80mm) prints automatically with restaurant/branch info, invoice & order
  number, cashier, table, customer, items, discount, VAT, totals, payment
  method, paid/change and a thank-you footer. Paid orders can be reprinted.
- **Kitchen Order Ticket (KOT)** — printed immediately when an order is placed
  (before payment). Contains kitchen-required items only (no prices/totals),
  table, waiter, order time, notes and estimated prep time.
- **Realtime everywhere** — kitchen status, ETA changes, order-ready
  notifications and payment status all stream via Supabase Realtime.
- **Image upload to Supabase Storage** — menu-item photos (and the restaurant
  logo in Settings) are uploaded to public storage buckets. Every image is
  optimised in the browser **before** upload (downscaled + re-encoded, stepping
  quality until the file is at least 30% smaller) so storage and load times
  stay low.

## Architecture

### Public website (route `/`)

Single-page-feel storefront in this vertical order:

1. **Header** — logo, branch selector (persisted), nav links
2. **Hero + reservation form** — embedded booking form pre-filled with the selected
   branch, plus **live branch-wise table availability** via SECURITY DEFINER RPCs
   (`reserved_tables`, `available_tables`) so anonymous visitors see open slots
   without exposing the tables/reservations tables
3. **Categories** — horizontal chip bar for the selected branch; clicking filters/scrolls
4. **Menu items** — grouped by category for the selected branch, with price and
   "Sold out" badges; switching branch reloads everything reactively
5. **Footer** — selected branch's address/contact + social links

### Staff portal (route `/admin`)

- `/admin/login` — email/password (Supabase Auth)
- `/admin/forbidden` — shown when a role hits a route it can't access
- Role-aware dashboard and nav; every route stays under `/admin/...`
- **Route-level access control** is enforced in two layers:
  1. Client guard (`AdminRoute`) redirects to `/admin/forbidden`
  2. **Supabase RLS blocks the actual query** server-side — a role that guesses a
     URL still cannot read or write another branch's data

| Role    | Nav / access                                                        | Default landing          |
|---------|---------------------------------------------------------------------|--------------------------|
| owner   | Full nav: dashboard, branches, menu, tables, reservations, staff, orders, reports, order-taking, payment methods, settings | `/admin/dashboard` |
| admin   | Same as owner                                                        | `/admin/dashboard` |
| manager | Menu, tables, reservations, orders, reports, order-taking, payment methods (scoped to their branch) | `/admin/dashboard` |
| waiter  | Order Taking + Billing (scoped to their branch)                      | `/admin/order-taking` |
| cashier | POS/Billing + Order Taking (scoped to their branch)                  | `/admin/billing` |
| kitchen | Order Queue (status updates only, scoped to their branch)            | `/admin/orders` |

Owner/admin see a **branch switcher**; other staff are locked to their `branch_id`.
Default landing pages are configurable in `Admin → Settings` (stored in the
`role_default_routes` table).

### Modules

- **Branch management** — CRUD branches; each owns its own menu, tables,
  reservations, orders and staff
- **Menu management** (per branch) — categories + items, pricing, photos, availability
- **Table management** (per branch) — number/capacity, live status (Realtime)
- **Reservation management** (per branch) — list + approve/reject/completed/no-show
- **Staff management** — create auth accounts, assign role + home branch
- **Order monitoring** (per branch) — real-time active orders and status
- **Sales reports** — per-branch or consolidated, daily/weekly/monthly/annual
  revenue + best sellers
- **Order Taking** — pick table (dine-in) or takeaway, add items with qty/notes,
  send to kitchen, track `received → preparing → ready → served`, then bill.
  Kitchen-required items queue for the kitchen; non-kitchen items (e.g. water)
  are marked ready immediately. A kitchen ticket (KOT) prints automatically for
  kitchen items when the order is placed.
- **Billing** — charge open orders with the payment methods enabled for the
  branch (Cash/Card/bKash/Nagad/Rocket/Bank Transfer/QR/UPI), optional discount
  and VAT, cash received/change, frees the table on payment, and prints a
  customer invoice automatically.

### Database & RLS

Every branch-scoped table carries `branch_id`. RLS policies:

- Public can read active branches, categories, and **available** menu items, and
  insert reservations (approval is manual by staff).
- Staff can read/write only data in their own `branch_id`.
- Owner/admin access all branches (via `is_owner()`).
- Helper functions `current_staff()`, `is_owner()`, `branch_scope()`,
  `branch_accessible()` drive the policies.
- `reserved_tables` / `available_tables` are SECURITY DEFINER so the public hero
  can show availability safely.

## Realtime

- Order status, new orders, table status, and reservations update live through
  Supabase Realtime channels (one channel per active branch).
- Kitchen status, ETA changes, order-ready notifications and payment status also
  stream through Realtime (`orders`, `order_items`, `payments`, `tables` are all
  added to the `supabase_realtime` publication by the schema/migrations).

## Printers

- Customer invoices and kitchen tickets are rendered as self-contained receipt
  HTML sized for 58mm or 80mm thermal printers (see `src/lib/printing.js`).
- The browser print dialog opens automatically (popup-safe: the print window is
  opened synchronously from the click that submits the order/payment).

## Migrations

For deployments created with the V1 schema, run the files in
`supabase/migrations/` in order instead of re-running `schema.sql`:

1. `001_kitchen_products.sql` — `requires_kitchen` + per-item kitchen tracking
2. `002_payment_methods.sql` — payment methods + branch config + payments FK
3. `003_payments_invoice_fields.sql` — invoice fields + `cashier` role
4. `004_role_routes_and_settings.sql` — configurable landing routes + settings
5. `005_realtime.sql` — add tables to the realtime publication
6. `006_image_storage.sql` — public storage buckets + object-level RLS

## Image storage

- Buckets `product-images` (menu photos) and `branding` (restaurant logo) are
  created by `schema.sql` / migration 006 and are public-read only.
- Only authenticated staff (a row in `staff` for the signed-in user) can
  upload, replace or delete images — enforced by `storage.objects` policies.
- The client (`src/lib/storage.js`) optimises every image before upload: it is
  downscaled to a max dimension and re-encoded (WebP when supported), dropping
  the encode quality until the uploaded file is ≤ 70% of the original
  (guaranteed ≥ 30% smaller whenever the source allows it).
- Old images are deleted from storage when a new one replaces them or their
  menu item is deleted.

## Out of scope (V1)

Inventory management is intentionally not included. The schema leaves room to add
an `inventory`/`stock` table linked to `menu_items` without restructuring.

## Scripts

```bash
npm run dev      # dev server (port 5173)
npm run build    # production build
npm run preview  # preview production build
npm run lint     # eslint (flat config)
```
# Restaurant-Management
