# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (Expo React Native)
```bash
cd frontend
yarn install                    # Install dependencies
yarn start                     # Start Expo development server
yarn android                   # Run on Android
yarn ios                       # Run on iOS
yarn web                       # Run on web
yarn lint                      # Run ESLint
```

### Backend (FastAPI Python)
```bash
cd backend
pip install -r requirements.txt # Install dependencies
uvicorn server:app --host 0.0.0.0 --port 8000 --reload  # Start development server
```

### Database Migrations
```bash
psql $DATABASE_URL -f backend/migrations/XXX_migration_name.sql
```

## Architecture Overview

### Project Structure
- **Frontend**: Expo (React Native) with file-based routing via Expo Router
- **Backend**: FastAPI with async PostgreSQL (Supabase)
- **State Management**: React Context API (UserContext, AuthContext)
- **Database**: PostgreSQL with comprehensive migrations system
- **AI Integration**: OpenAI GPT-4 Vision for food recognition and analytics

### Core Components Architecture

#### Frontend App Structure
```
app/
├── (tabs)/                    # Tab-based navigation
│   ├── home.tsx              # Dashboard with macro tracking
│   ├── analytics.tsx         # AI insights with caching
│   ├── log.tsx               # Food logging (camera/voice/manual)
│   ├── profile.tsx           # User profile management
│   ├── chef.tsx              # Recipe management
│   └── quest.tsx             # Gamification features
├── onboarding.tsx            # Multi-step user setup
├── camera.tsx                # AI photo analysis
├── food-details.tsx          # Individual food information
└── followers.tsx/following.tsx # Social features
```

#### Backend API Architecture
- **User Management**: Profile creation, goal calculation using Mifflin-St Jeor equation
- **Food Database**: Regional Indian cuisine (25+ dishes) with search and categorization
- **Meal Logging**: Multi-modal input (photo AI, voice, manual, barcode ready)
- **Analytics**: AI-powered insights with PostgreSQL caching to reduce OpenAI costs
- **Image Processing**: OpenAI Vision API with coin-based portion estimation

#### State Management Pattern
- **UserContext**: User profile, targets, authentication state
- **API Layer**: Centralized in `utils/api.ts` with axios
- **Local Storage**: AsyncStorage for offline user data persistence

### Key Technical Details

#### AI Food Recognition System
- Uses GPT-4 Vision for food identification and portion estimation
- Coin detection for scale reference (₹1, ₹2, ₹5, ₹10, US coins)
- Confidence scoring with fallback manual entry
- Structured response parsing for nutrition data

#### Nutrition Calculation Engine
- **BMR Calculation**: Mifflin-St Jeor equation with gender-specific formulas
- **TDEE Factors**: Activity multipliers (1.2 to 1.9)
- **Goal Adjustments**: Weight loss (-500 cal), muscle gain (+300 cal)
- **Macro Distribution**: 30% protein, 40% carbs, 30% fat

#### Analytics Caching Strategy
- PostgreSQL cache table with time_range segmentation (week/month/year)
- Expensive AI analysis cached to reduce OpenAI API costs
- Rate limiting and expiration timestamps
- Background warmup capabilities via edge functions

#### Database Schema Patterns
- **Users**: Complete profile with calculated targets
- **Foods**: Regional database with micronutrient data
- **Meals**: JSON array of foods with totals and logging metadata
- **Analytics_Cache**: AI insights with expiration and bio impact scoring

### Development Patterns

#### Component Architecture
- Custom reusable components in `components/` directory
- Consistent design system using `constants/Colors.ts`
- Card-based layouts with 16px border radius standard
- React Native Gifted Charts for data visualization

#### API Integration Pattern
- Centralized error handling in api.ts
- Async/await with proper error boundaries
- Token-based authentication flow
- Environment-specific backend URL configuration

#### Migration Management
- Sequential numbered migrations (001, 002, etc.)
- Separate migrations for features, optimizations, and backfills
- Support for analytics caching, social features, and quest system

## Environment Configuration

### Backend (.env)
```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o
OPENAI_CHEAP_MODEL=gpt-4.1-mini
ADMIN_SYNC_KEY=your-admin-sync-key
USDA_API_KEY=optional
```

### Frontend (.env)
```bash
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

## Testing Strategy

Follow the comprehensive testing protocol in `test_result.md`:
1. Onboarding flow completion and target calculation verification
2. Photo logging with coin detection accuracy testing
3. Manual food search and multi-item logging
4. Dashboard progress ring and macro breakdown validation
5. History filtering and meal summary verification

Always test the complete user journey from onboarding through daily usage patterns.