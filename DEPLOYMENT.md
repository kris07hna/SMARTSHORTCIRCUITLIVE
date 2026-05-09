# OPTOSAFE-AN Deployment Guide

## Vercel Deployment (Recommended)

### Prerequisites
- GitHub account with code pushed
- Vercel account (free tier available)

### Steps

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Sign in or create a free account

2. **Import Project**
   - Click "Add New" → "Project"
   - Select "Import Git Repository"
   - Choose your GitHub repository containing the code
   - Click "Import"

3. **Environment Variables (Optional)**
   - Vercel will auto-detect Next.js
   - Default environment values are built-in:
     - `NEXT_PUBLIC_POLL_MS=2000`
     - `NEXT_PUBLIC_HISTORY_LIMIT=180`
     - `NEXT_PUBLIC_SHORT_THRESHOLD_MA=10`
   - Only customize if you want different values

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (2-3 minutes)
   - Get your live URL

### After Deployment
- Your dashboard is now live at `https://your-project-name.vercel.app`
- It will automatically update on every push to main branch
- Firebase data flows directly from your RTDB

---

## Local Development

### Setup
```bash
# Clone repository
git clone <your-repo-url>
cd smartshortcircuitlive

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build for Testing
```bash
npm run build
npm start
```

---

## Firebase Configuration

### Current Setup
- Database URL: `https://smart-circuit-monitor-default-rtdb.asia-southeast1.firebasedatabase.app`
- Device Path: `devices/esp32-s3-devkitm-1/ina219`
- These are hardcoded for seamless deployment

### Expected Data Structure
```
/devices/esp32-s3-devkitm-1/ina219/
  ├── latest/
  │   ├── busVoltage
  │   ├── current_mA
  │   ├── power_mW
  │   ├── shuntVoltage_mV
  │   ├── wifi_rssi_dBm
  │   ├── status
  │   └── uptime_ms
  ├── history/
  │   ├── <timestamp_1>: {...}
  │   └── <timestamp_2>: {...}
  └── events/
      └── <eventId>: {...}
```

### Firebase Security Rules
Set these rules to allow public read access:
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

For event acknowledgment/clearing with write access:
```json
{
  "rules": {
    "devices": {
      ".read": true,
      ".write": "auth != null || request.from.query.token == 'your-secret-token'"
    }
  }
}
```

---

## Troubleshooting

### Build Fails
- Check Node.js version: `node --version` (requires 18+)
- Clear cache: `rm -rf .next && npm run build`

### Data Not Loading
- Verify Firebase URL in `app/page.js`
- Check Firebase RTDB has public read access
- Test URL: `https://smart-circuit-monitor-default-rtdb.asia-southeast1.firebasedatabase.app/devices/esp32-s3-devkitm-1/ina219/latest.json`

### Event Buttons Not Working
- Requires Firebase write permissions
- May need to update security rules or add auth token

---

## Performance Tips

- `NEXT_PUBLIC_POLL_MS`: Increase (e.g., 5000) for slower polling to reduce Firebase reads
- `NEXT_PUBLIC_HISTORY_LIMIT`: Decrease (e.g., 100) for faster loading with less data

---

## Support

- Documentation: See README.md
- Issues: Check GitHub repository
- Firebase Help: [firebase.google.com](https://firebase.google.com)
