# Android Native Implementation Guide
**Pace Plot for Android (com.stridecircuit.paceplot)**

This document details the native Android architecture and Kotlin implementations designed to keep cloud operational costs at **$0/month** while supporting thousands of runners.

---

## 1. Technical Stack

* **UI**: Kotlin + Jetpack Compose (Material 3)
* **Map Engine**: MapLibre Native SDK for Android (`org.maplibre.gl:android-sdk:11.5.1`)
* **Vector Tiles**: OpenStreetMap via Cloudflare R2 PMTiles (Zero egress bandwidth fees)
* **Geocoding**: Komoot Photon / Nominatim API (Free OSM geocoding)
* **Navigation Voice**: Native Android `TextToSpeech` (`android.speech.tts.TextToSpeech`)
* **Health & Biometrics**: Android Jetpack Health Connect (`androidx.health.connect:connect-client:1.1.0-alpha11`)
* **Local Storage**: Room Database (SQLite) with Google Drive AppData backup
* **Cloud Sync & Auth**: Supabase Free Tier (Up to 50,000 monthly active users free)

---

## 2. Key Modules & Android Services

### Foreground Navigation Service (`NavigationService.kt`)
* Manages continuous GPS polling via `FusedLocationProviderClient`.
* Requests transient audio focus (`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`) to lower music/podcast volume during spoken turn maneuvers.
* Dispatches advance voice warnings at 35 meters and haptic vibration pulses at 10 meters.

### Safety Scoring Engine (`SafeRouteCalculator.kt`)
* Evaluates street safety using OpenStreetMap metadata tags:
  * `highway=footway|path|pedestrian`: +15 score bonus (traffic-free paths)
  * `lit=yes`: +10 score bonus (illuminated streets)
  * `sidewalk=both|left|right`: +8 score bonus (dedicated pedestrian buffer)
  * `highway=primary|trunk`: -30 penalty (avoids busy arterial roads)

### Stride SafeGuard™ Emergency Live Beacon
* Generates a temporary session token sent to emergency contacts via SMS.
* Runs accelerometer and GPS immobility monitoring: triggers an audible 45-second countdown if a runner stops unexpectedly for > 3 minutes outside a designated water station.
* Sends emergency coordinates to contacts via native `SmsManager` if not cancelled.
