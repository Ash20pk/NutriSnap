# Loggr

Loggr helps you understand packaged foods and track meals.

**NutriLens** is the barcode feature: scan a product and get a simple, consumer-friendly health explanation.

## What you can do

- **NutriLens: Barcode scanning + health analysis**
  - Scan packaged foods by barcode.
  - If enabled, returns an AI health check with:
    - Verdict (good / caution / avoid)
    - Summary + verdict reason
    - Red flags with: what it is, why it matters, evidence (when available), suggestion

- **Meal logging**
  - Log meals with macros (calories / protein / carbs / fat).
  - Photo-based meal analysis + voice logging are supported.

- **Reliable barcode lookups**
  - Normalizes barcodes and tries common variants.
  - Uses OpenFoodFacts as an upstream source and persists results.
  - Handles “product not found” and “incomplete label” scenarios.

- **Community contribution flow (when a barcode is missing/incomplete)**
  - Capture up to **3 label photos** (nutrition + ingredients).
  - If the product is truly not found, also capture an optional **front-of-pack** photo.
  - Images are uploaded to **Supabase Storage** (low/medium quality) and stored as URLs in review notes.
  - Two-step contribution UI with stable modal height and a clear “Analyze” action.
  - Camera is unmounted while modals are open (battery-friendly).

- **Analytics dashboard**
  - Shows nutrition stats and AI insights.
  - Supports cached AI analytics and a bundled endpoint for faster loads.

- **AI Chef**
  - Generate recipes from ingredients + goals + cuisine.
  - Save recipes.

## How NutriLens works

- Scan a barcode.
- If the product exists, you’ll see nutrition info + (optionally) a NutriLens health verdict.
- If the product is missing or incomplete, you can contribute photos of the nutrition label / ingredients so it can be added.

## Privacy & data

- Label contribution photos are stored to help process/verify the product.
- We store photo **URLs** (not base64) for the contribution flow.

## Brand

Colors live in `frontend/constants/Colors.ts`.

- **Primary (brand green)**: `#2F593E`
- **Background**: `#F2E5D5`
- **Accent / highlight orange**: `#F28D35`

---

## For developers

## Tech stack

### Frontend

- Expo (React Native) + Expo Router
- `expo-camera`, `expo-image-picker`
- `axios`

### Backend

- FastAPI (Python)
- Postgres (Supabase) via `asyncpg`
- OpenAI (chat + vision)
- Supabase Storage (service role) for contribution images
- Optional upstream enrichment: OpenFoodFacts (and USDA support exists but is optional)

## Project structure

```
Loggr/
├── backend/
│   ├── server.py
│   ├── migrations/
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── (tabs)/
│   │   ├── barcode.tsx
│   │   ├── camera.tsx
│   │   └── onboarding.tsx
│   ├── constants/Colors.ts
│   └── utils/api.ts
└── DEPLOYMENT_GUIDE.md
```

## API (high level)

The backend router is mounted under the `/api` prefix.

- **Foods / barcodes**
  - `GET /api/foods/barcode/{barcode}` (optionally `?include_health_check=true`)
  - `POST /api/foods/process-label` (label photo(s) contribution processing)
  - `POST /api/foods/label-submissions`
  - `GET /api/foods/categories`
  - `GET /api/foods/search`

- **Meals**
  - `POST /api/meals/log`
  - `POST /api/meals/log-photo`
  - `POST /api/meals/log-voice`
  - `GET /api/meals/history/{user_id}`
  - `GET /api/meals/stats/{user_id}`

- **Analytics**
  - `GET /api/analytics/{user_id}`
  - `GET /api/analytics/{user_id}/bundle`
  - `POST /api/analytics/{user_id}/refresh`

- **Chef / recipes**
  - `POST /api/chef/generate`
  - `POST /api/recipes/save`
  - `GET /api/recipes/saved/{user_id}`
  - `DELETE /api/recipes/{recipe_id}`

## Local development

### Prerequisites

- Node.js 18+
- Python 3.11+
- Postgres (Supabase recommended)
- OpenAI API key

### Backend

1. Install dependencies:

```bash
pip install -r backend/requirements.txt
```

2. Create `backend/.env` (example):

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME

OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o
OPENAI_CHEAP_MODEL=gpt-4.1-mini

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=food-labels
SUPABASE_STORAGE_PUBLIC=true

# Optional
ADMIN_SYNC_KEY=...
USDA_API_KEY=...
```

3. Run migrations:

```bash
psql $DATABASE_URL -f backend/migrations/017_food_health_check_cache.sql
psql $DATABASE_URL -f backend/migrations/018_food_label_submissions.sql
psql $DATABASE_URL -f backend/migrations/019_food_label_reviews.sql
psql $DATABASE_URL -f backend/migrations/020_barcodes_table.sql
```

4. Start the API server:

```bash
uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

1. Install dependencies:

```bash
yarn --cwd frontend install
```

2. Create `frontend/.env`:

```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

3. Start Expo:

```bash
yarn --cwd frontend start
```

## Notes

- Contribution photos are stored in Supabase Storage and referenced by URL (no base64 stored in DB).
- AI results are cached (health checks) to control cost and improve performance.