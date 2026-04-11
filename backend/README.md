# NutriSnap Backend

AI-powered nutrition tracking and analysis API built with FastAPI.

## Features

- 🔐 Supabase JWT authentication
- 🤖 OpenAI-powered food image analysis
- 📊 Personalized nutrition analytics with age/sex-specific RDA targets
- 🥗 Comprehensive food database with USDA integration
- 📸 Barcode scanning and label processing
- 💪 Macro and micronutrient tracking
- 🎯 Goal-based calorie and macro targets (protein-by-bodyweight)
- 📈 Weekly/monthly analytics with AI insights

## Project Structure

```
backend/
├── app/                      # Main application package
│   ├── main.py              # FastAPI app entrypoint
│   ├── core/                # Core configuration
│   │   ├── config.py        # Environment settings
│   │   └── logging_config.py
│   ├── api/                 # API layer
│   │   └── routes/          # Route modules
│   ├── services/            # Business logic
│   ├── db/                  # Database layer
│   ├── schemas/             # Pydantic models
│   └── utils/               # Utility functions
├── deploy/                  # Deployment files
│   ├── nutrisnap.service   # Systemd service
│   ├── nginx.conf          # Nginx config
│   ├── deploy.sh           # Deployment script
│   └── DEPLOYMENT.md       # Deployment guide
├── tests/                   # Test suite
├── server.py               # Legacy monolith (being refactored)
├── analytics_ai.py         # AI analytics module
├── nutrition_targets.py    # RDA/AI/UL tables
├── pyproject.toml          # Project configuration
├── requirements.txt        # Dependencies
└── gunicorn_conf.py        # Production server config
```

## Installation

### Development Setup

```bash
# Clone repository
git clone <repo-url>
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install package in editable mode with dev dependencies
pip install -e ".[dev]"

# Or install from requirements.txt
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Environment Variables

See `.env.example` for all available configuration options. Required variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/nutrisnap
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_JWT_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_SYNC_KEY=...
```

## Running the Application

### Development

```bash
# Using uvicorn (auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Or using the legacy entrypoint (still works)
uvicorn server:app --reload
```

### Production

```bash
# Using gunicorn with uvicorn workers
gunicorn app.main:app -c gunicorn_conf.py

# Or using systemd (recommended for VM deployment)
sudo systemctl start nutrisnap
```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

## Key Endpoints

### Authentication
- All endpoints require Supabase JWT in `Authorization: Bearer <token>` header
- Admin endpoints require `X-Admin-Key` header

### User Management
- `POST /api/user/onboard` - Create user profile
- `GET /api/user/me` - Get current user profile
- `PUT /api/user/{user_id}/goals` - Update goals
- `POST /api/user/me/weight-check` - Log weight update

### Meal Logging
- `POST /api/meals/log` - Log a meal
- `POST /api/meals/log-photo` - Analyze food photo with AI
- `GET /api/meals/history` - Get meal history
- `DELETE /api/meals/{meal_id}` - Delete meal

### Analytics
- `GET /api/analytics/{user_id}` - Get cached analytics
- `GET /api/analytics/{user_id}/bundle` - Get meals + analytics
- `POST /api/analytics/{user_id}/refresh` - Refresh analytics

### Food Database
- `GET /api/foods/search` - Search foods
- `GET /api/foods/barcode/{barcode}` - Lookup by barcode
- `POST /api/foods/label/process` - Process food label image

## Development

### Code Style

```bash
# Format code
black .
isort .

# Lint
flake8 .

# Type check
mypy app/
```

### Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=app --cov-report=html

# Run specific test
pytest tests/test_analytics.py -v
```

## Deployment

See `deploy/DEPLOYMENT.md` for complete VM deployment instructions.

Quick deploy to production VM:

```bash
cd /opt/nutrisnap/backend
sudo ./deploy/deploy.sh
```

## Architecture

### Calculation Standards

- **BMI**: WHO standard formula (kg/m²)
- **BMR**: Mifflin-St Jeor Equation
- **Protein targets**: Goal-based g/kg bodyweight
  - Weight loss: 1.8 g/kg
  - Muscle gain: 1.6 g/kg
  - Maintenance: 1.2 g/kg
- **Micronutrient targets**: Age/sex-specific RDA/AI/UL from DRI tables
- **Nutrient aggregation**: Per-100g scaling from foods table

### Database

- PostgreSQL with asyncpg
- Connection pooling (5-20 connections)
- Graceful shutdown handling

### Caching

- Analytics cached for 6 hours (week/month) or 24 hours (year)
- Automatic refresh via cron job
- Stale data served with refresh trigger

### AI Integration

- OpenAI GPT-4 for food image analysis
- GPT-4.1-mini for analytics insights
- Token usage tracking
- Structured JSON outputs

## Monitoring

### Health Check

```bash
curl http://localhost/health
```

Response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected"
}
```

### Logs

```bash
# Follow logs
sudo journalctl -u nutrisnap -f

# View recent logs
sudo journalctl -u nutrisnap -n 100

# Search logs
sudo journalctl -u nutrisnap | grep ERROR
```

### Metrics

- Service status: `systemctl status nutrisnap`
- Resource usage: `htop` or `top`
- Database connections: Check asyncpg pool stats

## Troubleshooting

### Service won't start
```bash
# Check logs
sudo journalctl -u nutrisnap -n 50

# Verify environment
sudo -u nutrisnap cat /opt/nutrisnap/backend/.env

# Test database connection
psql $DATABASE_URL -c "SELECT 1"
```

### High memory usage
- Reduce worker count in `gunicorn_conf.py`
- Check for memory leaks in logs
- Restart service: `sudo systemctl restart nutrisnap`

### Slow responses
- Check database query performance
- Review asyncpg pool settings
- Check OpenAI API latency
- Enable nginx caching

## Contributing

1. Create feature branch
2. Make changes
3. Run tests and linters
4. Submit pull request

## License

MIT
