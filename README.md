# Pace Plot - Safe Run & Walk Navigation
**By Stride Circuit LLC**

Official Website: [https://stride-circuit-llc.polsia.io/](https://stride-circuit-llc.polsia.io/)

Pace Plot is an intelligent running and walking companion designed to help runners map safe, well-lit pedestrian routes, follow turn-by-turn spoken audio guidance, track real-time biometrics, and keep family members informed with live emergency tracking.

---

## Key Features

1. **AI Safe Loop Mapping**: Generates closed pedestrian loops based on target distance (e.g., 3.1-mile 5K, 6.2-mile 10K, half marathon) and surface style (Greenways, Quiet Roads, Lit Trails).
2. **OpenStreetMap & Safety Scoring**: Evaluates streets and trails for continuous sidewalks (`sidewalk=both`), street lighting (`lit=yes`), and traffic separation.
3. **Turn-by-Turn Spoken Navigation**: Background audio guidance with synthesized cues and audio ducking over music/podcasts.
4. **Stride SafeGuard™ Emergency Beacon (Premium)**:
   - Shareable live GPS web link dispatched via SMS when a run begins.
   - Immobility and incident detection with an automated 45-second countdown alert.
   - Live battery percentage and estimated return time for family peace of mind.
5. **Health Connect & Watch Ecosystem**:
   - Zero-cloud-fee synchronization with Android Health Connect (Google Fit, Samsung Health, Strava).
   - Standard `.gpx` export compatible with Garmin Connect, Apple Watch Workouts, COROS, and Suunto.
6. **RunRace USA Nationwide Calendar**:
   - Built-in event directory with one-tap *"Plan from Start Line"* route creation.

---

## Repository Structure

```
├── index.html                  # Working interactive prototype (MapLibre/OSM + Voice Nav + SafeGuard)
├── ANDROID_ARCHITECTURE.md     # Native Android (Kotlin + Jetpack Compose) architecture & code blueprint
├── .gitignore                  # Standard Android & Web gitignore
└── README.md                   # Project overview & documentation
```

---

## Running the Web Prototype Locally

You can test the prototype immediately in any modern web browser:
1. Double-click `index.html` (or serve it using `python3 -m http.server 8000`).
2. Open `http://localhost:8000` in Chrome, Edge, or Safari.
3. Tap **"Start Voice Nav"** to test spoken audio navigation and live GPS runner movement.
4. Try the top search bar to test live global address geocoding via OpenStreetMap & Photon.

---

## Free Hosting on GitHub Pages

You can host this interactive prototype for free directly on GitHub:
1. Push this repository to GitHub.
2. Go to **Settings** → **Pages** in your GitHub repository.
3. Under **Branch**, select `main` and root `/`, then click **Save**.
4. In under 60 seconds, your prototype will be live at `https://<your-username>.github.io/<repo-name>/`.
