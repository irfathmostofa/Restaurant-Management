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
# 2. Run the whole file: supabase/schema.sql

npm run dev
```

The schema file creates all tables, RLS policies, helper functions and seeds a demo
branch with sample categories, menu items and tables. See `.env.example` for
bootstrap instructions (including how to create your first owner account).

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
| owner   | Full nav: dashboard, branches, menu, tables, reservations, staff, orders, reports, order-taking | `/admin/dashboard` |
| admin   | Same as owner                                                        | `/admin/dashboard` |
| manager | Menu, tables, reservations, orders, reports, order-taking (scoped to their branch) | `/admin/dashboard` |
| waiter  | Order Taking + Billing (scoped to their branch)                      | `/admin/order-taking` |
| kitchen | Order Queue (status updates only, scoped to their branch)            | `/admin/orders` |

Owner/admin see a **branch switcher**; other staff are locked to their `branch_id`.

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
  send to kitchen, track `received → preparing → ready → served`, then bill
- **Billing** — charge open orders (cash/card/upi/qr), frees the table on payment

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
