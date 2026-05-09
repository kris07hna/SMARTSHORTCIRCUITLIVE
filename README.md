# OPTOSAFE-AN: IoT-Based Short Circuit Protection System with Live Monitoring

A modern Next.js dashboard for real-time monitoring of an ESP32-based short-circuit protection system with Firebase integration.

## Features

- **Live monitoring**: Real-time circuit status (normal or short-circuit)
- **Interactive charts**: Responsive Recharts visualization with historical data
- **Event management**: Acknowledge and clear short-circuit events
- **Mobile-first design**: Fully responsive layout with aurora effects and glass morphism
- **Real-time polling**: Automatic data refresh from Firebase RTDB
- **Positive magnitude normalization**: All readings displayed as positive values

## Tech Stack

- **Next.js 15.3.2** (App Router)
- **React 19**
- **Recharts** for interactive charts
- **Framer Motion** for animations
- **Lucide React** for icons
- **Firebase Realtime Database** for data source

## Data Source

The dashboard connects to Firebase RTDB nodes:

- `/devices/esp32-s3-devkitm-1/ina219/latest` - Current readings
- `/devices/esp32-s3-devkitm-1/ina219/history/<timestamp>` - Historical data
- `/devices/esp32-s3-devkitm-1/events/<eventId>` - Short-circuit events

## Environment Setup

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Firebase credentials:

```env
NEXT_PUBLIC_FIREBASE_DATABASE_URL=your-firebase-rtdb-url
NEXT_PUBLIC_FIREBASE_DEVICE_PATH=devices/your-device-id/ina219
NEXT_PUBLIC_POLL_MS=2000
NEXT_PUBLIC_HISTORY_LIMIT=180
NEXT_PUBLIC_SHORT_THRESHOLD_MA=10
```

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Build for Production

```bash
npm run build
npm start
```

## Vercel Deployment

### Quick Deploy

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables from `.env.example`
5. Deploy

### Manual Environment Setup on Vercel

In your Vercel project settings, add these environment variables:

- `NEXT_PUBLIC_FIREBASE_DATABASE_URL`
- `NEXT_PUBLIC_FIREBASE_DEVICE_PATH`
- `NEXT_PUBLIC_POLL_MS` (default: 2000)
- `NEXT_PUBLIC_HISTORY_LIMIT` (default: 180)
- `NEXT_PUBLIC_SHORT_THRESHOLD_MA` (default: 10)

### Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

## Firebase Security Rules

Ensure your Firebase RTDB rules allow public read access:

```json
{
  "rules": {
    "devices": {
      ".read": true,
      ".write": false
    }
  }
}
```

For event acknowledgment/clearing, you may need to configure write rules or add Firebase authentication.

## Notes

- Dashboard reads Firebase via public RTDB REST endpoint
- All electrical readings are normalized to positive magnitudes
- Supports configurable short-circuit detection threshold
- Event strip shows the latest 4 short-circuit windows
- Real-time updates via configurable polling interval
