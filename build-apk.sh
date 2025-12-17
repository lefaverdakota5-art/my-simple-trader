#!/bin/bash
# Build script for creating Android APK
# Requirements:
# - Node.js 22+ (for Capacitor 8)
# - Android SDK
# - Java 21+

set -e

echo "🚀 Building AI Trader APK..."

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "❌ Error: Node.js 22+ is required. Current version: $(node --version)"
    echo "Please install Node.js 22+ from https://nodejs.org/"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build web app
echo "🔨 Building web app..."
npm run build

# Sync with Android
echo "📱 Syncing with Android..."
npx cap sync android

# Build APK
echo "🔧 Building Android APK..."
cd android
BUILD_NUMBER=${BUILD_NUMBER:-1} VERSION_NAME=${VERSION_NAME:-0.0.1} ./gradlew assembleDebug
cd ..

# Copy APK to root directory for easy access
echo "📦 Copying APK..."
cp android/app/build/outputs/apk/debug/app-debug.apk ./ai-trader-debug.apk

echo "✅ Build complete! APK available at: ./ai-trader-debug.apk"
echo ""
echo "To build a release APK (requires signing), run:"
echo "  cd android && ./gradlew assembleRelease"
