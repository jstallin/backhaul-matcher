# BackHaul - Smart Return Route Optimization

A logistics platform that solves the backhaul dilemma by matching empty return trips with revenue-generating loads.

## Features

- **Route Matching Algorithm**: Finds compatible loads within configurable search radius
- **Revenue Optimization**: Calculates and ranks opportunities by efficiency score
- **OOR Miles Calculation**: Compares additional miles vs. direct return
- **Relay Mode**: Optional return to fleet home between pickup and delivery
- **Equipment Compatibility**: Filters loads by trailer type, length, and weight
- **DAT Integration**: Ready for DAT Load Board API connection

## Tech Stack

- React 18
- Vite (build tool)
- Vercel (deployment)

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Deploy to Vercel

### Option 1: Using Vercel CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Option 2: Connect to GitHub
1. Push this code to GitHub
2. Go to https://vercel.com
3. Click "Import Project"
4. Select your GitHub repository
5. Vercel will auto-detect the Vite config
6. Click "Deploy"

## Algorithm Details

### OOR Miles Calculation

**Standard Mode:**
```
Final Stop → Pickup → Delivery → Fleet Home
```

**Relay Mode:**
```
Final Stop → Pickup → Fleet Home → Delivery → Fleet Home
```

### Efficiency Score
```
Score = (Total Revenue / OOR Miles) × Total Revenue
```

Higher scores indicate better opportunities (more revenue per additional mile).

## Next Steps for Production

1. **DAT API Integration** - Replace mock data with real DAT API calls
2. **Authentication** - Add user login and fleet management
3. **Database** - Store fleet profiles and search history
4. **Real Routing** - Integrate Google Maps Routes API or PC Miler
5. **Mobile Apps** - Build native iOS/Android apps
6. **WebSocket Updates** - Real-time load availability
7. **Toll Calculations** - Add toll avoidance options
8. **Multiple Mileage Engines** - Support PC Miler variants

## Environment Variables

Create `.env` file for production:

```env
VITE_DAT_API_KEY=your_dat_api_key
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key
```

## License

Proprietary - All Rights Reserved
