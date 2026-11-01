# Menu3D: 3D QR restaurant menu

Monorepo (npm workspaces):

```
apps/
  api/   Express + MongoDB (Mongoose) REST API, JWT admin login, image upload
  web/   Next.js 14 (App Router): public 3D menu + owner admin panel
```

Customers scan a QR code and see each dish as a plate that turns in 3D (three.js). Tapping a dish opens a viewer to rotate, tilt and zoom it; admins tune lighting per dish with a live preview.
The owner logs in at `/admin` to add dishes, upload photos, mark items sold out, edit
the restaurant name and download the table QR code.

## Run locally

Requirements: Node 20+, Docker (for MongoDB) or a MongoDB Atlas URI.

```bash
npm install
npm run db                       # starts MongoDB in Docker (skip if using Atlas)
cp apps/api/.env.example apps/api/.env      # edit JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
cp apps/web/.env.example apps/web/.env.local
npm run seed                     # creates the owner account and 3 sample dishes
npm run dev                      # API on :4000, web on :3000
```

- Menu: http://localhost:3000
- Admin: http://localhost:3000/admin/login

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/r/:slug/menu` | no | A restaurant's settings, plan features and available dishes |
| GET | `/api/images/:id` | no | Dish image |
| POST | `/api/auth/login` | no | Returns a JWT |
| GET/POST | `/api/admin/dishes` | yes | List / create dishes |
| PUT/DELETE | `/api/admin/dishes/:id` | yes | Update / delete a dish |
| POST | `/api/admin/upload` | yes | Upload a photo (square-cropped, compressed) |
| GET/PUT | `/api/admin/settings` | yes | Restaurant name, tagline, currency |

## Deploy

1. **Database:** create a free MongoDB Atlas cluster and copy its connection string.
2. **API:** deploy `apps/api` (Render, Railway or a VPS). Set `MONGODB_URI`, `JWT_SECRET`
   (a long random string), `CLIENT_ORIGIN` (your web URL). Run `npm run seed` once.
3. **Web:** deploy `apps/web` (Vercel). Set `API_URL` to the API's public URL.
4. Open `/admin`, then the **QR code** tab, enter the live domain and download the QR.

## Notes for production

- Many restaurants share one deployment: each has a slug (`/r/<slug>`) and a plan (starter, standard, pro) that only the super admin (`/super`) can change. Plan rules live in `apps/api/src/plans.js`. The bare domain can redirect to one menu via the `DEFAULT_RESTAURANT` env var on the web app.
- Admin token lives in `localStorage` for simplicity. For stricter security, move it to an
  httpOnly cookie.
- Images are stored in MongoDB (resized to 800 px). For hundreds of dishes, move to S3 or
  Cloudinary and store the URL.
- 3D works best with top-down food photos. Each plate is created only while visible on
  screen and disposed when scrolled away, so long menus stay light on phones.
- If WebGL is unavailable, the card falls back to a normal photo.

### Cutouts and depth maps (memory)

When a photo is uploaded, two ML models can prepare it for the 3D view: one removes the background (cutout) and one estimates depth. Each needs several hundred MB of RAM while it runs, which crashes a small instance (Render's 512 MB, for example), so:

- They are **off by default** on Render and when `NODE_ENV=production`, and **on** on a developer machine. Override with `ENABLE_ML=1` (give the API at least 2 GB) or `ENABLE_ML=0`. `CUTOUT=off` / `DEPTH=off` switch one of them off.
- Photos uploaded while they are off are simply saved, and the dish shows a normal rounded photo in 3D. To prepare them, run `npm run cutouts -w apps/api` from any machine with enough memory and `MONGODB_URI` pointing at the same database. It only touches photos that are not processed yet, so it is safe to run again and again.
- When they are on, each model runs in its own process that exits after a minute of no work, so its memory is released.
- The depth model (about 25 MB) is downloaded from Hugging Face on first use into `apps/api/.model-cache`.
- On a 512 MB instance, also set `NODE_OPTIONS=--max-old-space-size=384`.
