# Menu3D: 3D QR restaurant menu

Monorepo (npm workspaces):

```
apps/
  api/   Express + MongoDB (Mongoose) REST API, JWT admin login, image upload
  web/   Next.js 14 (App Router): public 3D menu + owner admin panel
```

Customers scan a QR code and see each dish as a plate that turns in 3D (three.js).
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
| GET | `/api/menu` | no | Settings, categories and available dishes |
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

- One deployment serves one restaurant. For many restaurants, add a `restaurantId` to
  `Dish`, `Settings` and `Admin`, and read it from the subdomain.
- Admin token lives in `localStorage` for simplicity. For stricter security, move it to an
  httpOnly cookie.
- Images are stored in MongoDB (resized to 800 px). For hundreds of dishes, move to S3 or
  Cloudinary and store the URL.
- 3D works best with top-down food photos. Each plate is created only while visible on
  screen and disposed when scrolled away, so long menus stay light on phones.
- If WebGL is unavailable, the card falls back to a normal photo.
