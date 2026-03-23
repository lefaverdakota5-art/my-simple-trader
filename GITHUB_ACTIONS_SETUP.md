# GitHub Actions CI/CD Setup Guide

Complete setup instructions for the Masterpiece Swarm Trader automated build pipeline.

## Overview

This repository uses GitHub Actions to automatically build and release the app for:

| Platform | Workflow | Artifact |
|----------|----------|----------|
| 📱 Android APK | `build-all-platforms.yml` | `.apk` file |
| 🍎 iOS Bundle  | `build-all-platforms.yml` | `.zip` bundle |
| 🖥️ Desktop Python | `build-all-platforms.yml` | `.zip` bundle |

## Downloading Pre-Built Binaries

### From GitHub Actions (latest commit)
1. Go to **Actions** → **Build All Platforms**
2. Click the most recent successful run
3. Scroll down to **Artifacts**
4. Download `android-apk-<run>`, `ios-bundle-<run>`, or `desktop-python-<run>`

### From Releases (tagged versions)
1. Go to **Releases** on the repository main page
2. Find the latest release (e.g. `v1.5.0`)
3. Download the asset for your platform

## Required GitHub Secrets

Add these in **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Description | Required |
|--------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `OPENAI_API_KEY` | OpenAI API key for AI council | Optional |
| `KRAKEN_API_KEY` | Kraken exchange API key | Optional (live mode only) |
| `KRAKEN_SECRET` | Kraken exchange secret | Optional (live mode only) |
| `ALPACA_API_KEY` | Alpaca trading API key | Optional (stocks) |
| `ALPACA_SECRET` | Alpaca trading secret | Optional (stocks) |

> **Note:** All secrets are optional for paper trading mode. The bot runs in `paper` mode by default with no real money at risk.

## Triggering Builds

### Automatic
- Every push to any branch triggers `build-all-platforms.yml`
- Every PR to `main`/`develop` triggers `pull-request.yml` (lint + tests)

### Manual
1. Go to **Actions** → select a workflow
2. Click **Run workflow** → select branch → **Run workflow**

### Creating a Release
```bash
git tag v1.5.0
git push origin v1.5.0
```
This triggers `release.yml` which builds all platforms and creates a GitHub Release with download links.

## Local Build

### Android APK
```bash
# Prerequisites: Node.js 22, JDK 17, Android SDK
./scripts/build.sh android
```

### Desktop Python Package
```bash
./scripts/build.sh desktop
```

### Run Tests
```bash
./scripts/build.sh test
```

### Build Everything
```bash
./scripts/build.sh all
```

## Setting Up the Supabase Database

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Apply the schema
supabase db push
# OR apply directly:
psql "$DATABASE_URL" < schema.sql
```

## iOS Build Notes

iOS builds require:
1. A Mac with Xcode 15+
2. An Apple Developer account (free or paid)
3. Code signing certificates

Steps:
```bash
# Install kivy-ios toolchain
pip install kivy-ios
toolchain build kivy python3 openssl

# Create the Xcode project
toolchain create MasterpieceSwarmTrader .

# Open in Xcode
open MasterpieceSwarmTrader-ios/MasterpieceSwarmTrader.xcodeproj
```

Then in Xcode: select your device or simulator and press **Run** (⌘R).

## Environment Variables

Copy `.env.template` to `.env` and fill in your values:

```bash
cp .env.template .env
# Edit .env with your API keys
```

See `.env.template` for all available options.

## Dependabot Auto-Merge

The `auto-merge.yml` workflow automatically approves and merges Dependabot PRs for **patch** and **minor** version updates. Major version updates require manual review.

## Workflow Reference

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `build-all-platforms.yml` | Every push, every PR | Builds Android, iOS, Desktop |
| `pull-request.yml` | PR to main/develop | Lint, tests, build verification |
| `release.yml` | Tag push (`v*.*.*`) | Full build + GitHub Release |
| `auto-merge.yml` | Dependabot PR | Auto-merge patch/minor updates |
