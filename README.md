# NutriSnap - AI-Powered Nutrition Tracking App

## Overview

NutriSnap is a mobile nutrition tracking application built with Expo (React Native) and a FastAPI backend. It supports AI-assisted meal logging, nutrition tracking (macros + micronutrients), and an Analytics dashboard powered by cost-effective AI analysis with caching.

## Features

### Core Features (MVP)

1. **AI Photo Logging with Coin Calibration**
   - Take photos of meals with a coin for accurate portion estimation
   - OpenAI Vision API for food recognition
   - Real-time analysis and nutrition calculation

2. **Regional Food Database**
   - Comprehensive Indian cuisine database (25+ dishes)
   - Categories: North Indian, South Indian, Street Food
   - Accurate nutrition data per 100g

3. **Smart Dashboard**
   - Daily calorie and macro tracking
   - Visual progress indicators
   - Weekly trends and patterns
   - Goal tracking

4. **Multiple Input Methods**
   - Photo logging (with camera)
   - Voice logging (speech input)
   - Manual entry (search and select)
   - Barcode scanning (ready)

5. **Personalized Onboarding**
   - User profile setup (age, gender, height, weight)
   - Goal selection (lose weight, gain muscle, maintain, health)
   - Activity level assessment
   - Dietary preferences
   - Automatic calorie and macro target calculation

6. **Meal History**
   - Complete meal log with timestamps
   - Daily summaries
   - Nutrition breakdown per meal
   - Filter by date range

7. **Profile Management**
   - View user stats
   - Daily targets overview
   - Dietary preferences
   - Logout functionality

## Tech Stack

### Frontend
- **Framework**: Expo (React Native)
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Context API
- **UI Components**: Custom components with React Native
- **Icons**: @expo/vector-icons (Ionicons)
- **Camera**: expo-camera
- **Image Picker**: expo-image-picker
- **Speech**: expo-speech
- **Storage**: @react-native-async-storage/async-storage
- **HTTP Client**: axios
- **Date Utilities**: date-fns

### Backend
- **Framework**: FastAPI (Python)
- **Database**: Supabase Postgres (asyncpg)
- **AI**: OpenAI (chat + vision), with a cheaper model for analytics (configurable)
- **Image Processing**: Pillow
- **External Data**: USDA FoodData Central (optional enrichment)

## Project Structure

```
NutriSnap/
├── backend/
│   ├── server.py                      # FastAPI app (API + analytics)
│   ├── analytics_ai.py                # AI analytics prompt + schema
│   ├── migrations/                    # SQL migrations (Supabase Postgres)
│   └── requirements.txt               # Python dependencies
├── frontend/
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx           # Tab layout
│   │   │   ├── home.tsx              # Dashboard
│   │   │   ├── analytics.tsx         # Analytics (AI insights + charts)
│   │   │   ├── history.tsx           # Meal history
│   │   │   ├── profile.tsx           # Profile
│   │   │   ├── chef.tsx              # Chef
│   │   │   └── quest.tsx             # Quest
│   │   ├── onboarding.tsx            # Onboarding
│   │   └── camera.tsx                # Camera logging
│   ├── components/
│   ├── constants/Colors.ts
│   ├── context/UserContext.tsx
│   └── utils/api.ts                  # API client
├── supabase/
│   └── functions/analytics-cache-warmup/  # Edge function (optional warmup)
└── DEPLOYMENT_GUIDE.md
```

## API Endpoints

### User Management
- `POST /api/user/onboard` - Create user profile with calculated targets
- `GET /api/user/{user_id}` - Get user profile
- `PUT /api/user/{user_id}/goals` - Update goals and recalculate targets

### Food Database
- `GET /api/foods/search` - Search foods (query, category, vegetarian filter)
- `GET /api/foods/categories` - Get all food categories

### Meal Logging
- `POST /api/meals/log-photo` - Analyze food photo with AI
- `POST /api/meals/log` - Log a meal
- `POST /api/meals/log-voice` - Parse voice input
- `GET /api/meals/history/{user_id}` - Get meal history
- `GET /api/meals/stats/{user_id}` - Get daily nutrition stats

### Analytics (AI + Cache)
- `GET /api/analytics/{user_id}?time_range=week|month|year` - Get cached analytics (instant when warm)
- `POST /api/analytics/{user_id}/refresh?time_range=week|month|year` - Force refresh (rate-limited)

### Admin / Data Sync (optional)
- `POST /api/admin/usda/sync` - Enrich foods using USDA (requires `ADMIN_SYNC_KEY`)

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase Postgres (or any Postgres compatible with the schema)
- Expo CLI
- OpenAI API Key

### Backend Setup

1. Install dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. Configure environment variables in `.env`:
   ```
   DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
   OPENAI_API_KEY=your_api_key_here
   OPENAI_MODEL=gpt-4o
   OPENAI_CHEAP_MODEL=gpt-4.1-mini
   ADMIN_SYNC_KEY=your-admin-sync-key
   USDA_API_KEY=optional
   ```

3. Run migrations (example):
   ```bash
   psql $DATABASE_URL -f backend/migrations/008_analytics_cache.sql
   ```

4. Start the server:
   ```bash
   uvicorn server:app --host 0.0.0.0 --port 8000 --reload
   ```

### Frontend Setup

1. Install dependencies:
   ```bash
   cd frontend
   yarn install
   ```

2. Configure environment variables in `.env`:
   ```
   EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
   ```

3. Start the development server:
   ```bash
   yarn start
   ```

4. Run on device:
   - iOS: `yarn ios`
   - Android: `yarn android`
   - Web: `yarn web`
   - Or scan QR code with Expo Go app

## Design System

### Color Palette
- Colors live in `frontend/constants/Colors.ts` and are used consistently across the app (cards, charts, and accents).

### Design Principles
- Clean, modern aesthetic with biophilic elements
- Rounded corners (16px standard)
- Generous whitespace
- Soft shadows for depth
- Card-based layouts
- Mobile-first responsive design

## Calorie Calculation

The app uses the **Mifflin-St Jeor Equation** to calculate BMR (Basal Metabolic Rate):

**For Men:**
```
BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age) + 5
```

**For Women:**
```
BMR = (10 × weight in kg) + (6.25 × height in cm) - (5 × age) - 161
```

**TDEE Calculation:**
```
TDEE = BMR × Activity Multiplier
```

Activity Multipliers:
- Sedentary: 1.2
- Light: 1.375
- Moderate: 1.55
- Active: 1.725
- Very Active: 1.9

**Goal Adjustments:**
- Lose Weight: TDEE - 500 cal (deficit)
- Gain Muscle: TDEE + 300 cal (surplus)
- Maintain: TDEE

**Macro Distribution:**
- Protein: 30% (4 cal/g)
- Carbs: 40% (4 cal/g)
- Fat: 30% (9 cal/g)

## AI Food Recognition

The app uses OpenAI's GPT-4 Vision API with custom prompts:

1. **Coin Detection**: Identifies standard coins (₹1, ₹2, ₹5, ₹10, US coins) for scale reference
2. **Food Identification**: Recognizes Indian cuisine items
3. **Portion Estimation**: Calculates weight based on coin size (if detected) or visual estimation
4. **Confidence Scoring**: Provides confidence levels (high/medium/low)

## Database Schema

### User Profile
```javascript
{
  id: string,
  name: string,
  age: number,
  gender: string,
  height: number,  // cm
  weight: number,  // kg
  goal: string,
  activity_level: string,
  dietary_preference: string,
  daily_calorie_target: number,
  protein_target: number,
  carbs_target: number,
  fat_target: number,
  created_at: datetime,
  onboarding_completed: boolean
}
```

### Meal Log
```javascript
{
  id: string,
  user_id: string,
  meal_type: string,  // breakfast, lunch, dinner, snack
  foods: array,
  total_calories: number,
  total_protein: number,
  total_carbs: number,
  total_fat: number,
  image_base64: string,  // optional
  logging_method: string,  // photo, voice, manual, barcode
  notes: string,  // optional
  timestamp: datetime
}
```

### Analytics Cache
AI analytics are cached in Postgres to reduce cost and improve UX:

```sql
analytics_cache(user_id, time_range, insights, bio_impact, recommendations, expires_at, ...)
```

See `backend/migrations/008_analytics_cache.sql` and `DEPLOYMENT_GUIDE.md` for warmup + cron configuration.

## Testing

The app includes comprehensive backend testing. See `test_result.md` for testing protocol.

### Manual Testing

1. **Onboarding Flow**:
   - Complete all 4 steps
   - Verify target calculations

2. **Photo Logging**:
   - Take photo with coin
   - Verify AI detection
   - Check nutrition calculation

3. **Manual Logging**:
   - Search for foods
   - Add multiple items
   - Verify totals

4. **Dashboard**:
   - Check progress rings
   - Verify macro breakdown
   - Test refresh

5. **History**:
   - View past meals
   - Filter by date
   - Check summaries

## Known Limitations

1. **Coin Detection**: Accuracy depends on lighting and coin visibility
2. **Food Recognition**: Best with well-lit, clear photos
3. **Database**: Limited to 25 Indian dishes (MVP)
4. **Offline Mode**: Requires internet for AI features

## Future Enhancements

### V2 Features
- Meal planning and recipes
- Wearable integration (Apple Health, Google Fit)
- Social features and challenges
- Expanded food database (500+ items)
- Multi-language support
- Barcode scanning implementation

### QuestFit Integration (V3+)
- Squad-based accountability
- Daily/weekly quests with XP
- Leaderboards and leagues
- Achievement system
- Premium features

## Contributing

This is an MVP project. For contributions:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License

## Support

For issues or questions:
- Check the test_result.md file
- Review API documentation
- Test backend endpoints with curl

## Credits

- UI Design: Inspired by modern health app aesthetics
- Icons: Ionicons by Expo
- AI: OpenAI (vision + chat)
- Framework: Expo & FastAPI

---

**Built with ❤️ for healthy living**