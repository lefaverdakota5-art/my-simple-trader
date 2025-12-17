# Android APK Build Guide for Simple Trader

## Prerequisites

1. **Node.js and npm** - Already installed for the project
2. **Android Studio** - Download from https://developer.android.com/studio
3. **Java Development Kit (JDK) 17** - Usually comes with Android Studio
4. **Capacitor CLI** - Already in package.json

## Step-by-Step Build Instructions

### 1. Install Android Studio and SDK

1. Download and install Android Studio from https://developer.android.com/studio
2. During installation, make sure to install:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device (optional, for testing)

3. Open Android Studio and go to Settings/Preferences
4. Navigate to: Appearance & Behavior → System Settings → Android SDK
5. In the SDK Platforms tab, install:
   - Android 13.0 (API Level 33) or higher
   
6. In the SDK Tools tab, install:
   - Android SDK Build-Tools
   - Android SDK Command-line Tools
   - Android Emulator (optional)
   - Android SDK Platform-Tools

### 2. Set Environment Variables

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/emulator
```

Reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

Verify installation:
```bash
echo $ANDROID_HOME
adb --version
```

### 3. Build the Web Application

```bash
# Navigate to project directory
cd /path/to/my-simple-trader

# Install dependencies (if not done already)
npm install

# Build the production web app
npm run build
```

This creates the `dist/` folder with the compiled web application.

### 4. Sync with Capacitor

```bash
# Sync web assets to Android project
npx cap sync android
```

This command:
- Copies web assets from `dist/` to `android/app/src/main/assets/public/`
- Updates Capacitor dependencies
- Generates native bridge code

### 5. Open in Android Studio

```bash
npx cap open android
```

This opens the Android project in Android Studio.

**Alternative**: Manually open the `android/` folder in Android Studio.

### 6. Configure Signing (For Release Build)

For release builds, you need to create a signing keystore:

```bash
keytool -genkey -v -keystore my-release-key.keystore \
  -alias my-key-alias \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then add to `android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file("../../my-release-key.keystore")
            storePassword "your_keystore_password"
            keyAlias "my-key-alias"
            keyPassword "your_key_password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

**Security**: Never commit keystore files or passwords to git!

### 7. Build APK

#### Option A: Debug APK (for testing)

In Android Studio:
1. Click: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Wait for build to complete
3. Click "locate" in the notification to find the APK

Or via command line:
```bash
cd android
./gradlew assembleDebug
```

Debug APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

#### Option B: Release APK (for distribution)

```bash
cd android
./gradlew assembleRelease
```

Release APK location: `android/app/build/outputs/apk/release/app-release.apk`

### 8. Install on Samsung Galaxy S20

#### Via USB (Recommended)

1. Enable Developer Mode on your phone:
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
   - Go back to Settings → Developer Options
   - Enable "USB Debugging"

2. Connect phone via USB

3. Install APK:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Or for release:
```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

#### Via File Transfer

1. Copy APK to phone:
```bash
adb push android/app/build/outputs/apk/debug/app-debug.apk /sdcard/Download/
```

2. On phone:
   - Open Files app
   - Navigate to Downloads
   - Tap the APK file
   - Allow "Install from Unknown Sources" if prompted
   - Tap "Install"

#### Via Cloud/Email

1. Upload APK to Google Drive, Dropbox, or email it to yourself
2. Download on phone
3. Install from Downloads folder

### 9. Test on Device

After installation:

1. **Launch App**: Find "AI Trader" icon and launch
2. **Test Login**: Create account or sign in
3. **Test Network**: Ensure app can reach backend
4. **Test Features**:
   - Dashboard loads correctly
   - Settings page works
   - Bank integration (Plaid) works
   - Council page displays correctly
   - Navigation between pages works

### 10. Troubleshooting

#### Build Fails with "SDK not found"

**Solution**:
- Verify ANDROID_HOME is set correctly
- Open Android Studio and install missing SDK components
- Run `sdkmanager --list` to see installed packages

#### "Command not found: adb"

**Solution**:
- Add Android SDK platform-tools to PATH
- Verify: `export PATH=$PATH:$ANDROID_HOME/platform-tools`

#### App crashes on launch

**Check**:
1. Look at Android Studio Logcat for errors
2. Verify `capacitor.config.json` is correct
3. Ensure all Capacitor plugins are installed
4. Run `npx cap sync android` again

**View logs**:
```bash
adb logcat | grep -i capacitor
```

#### "Installation blocked"

**Solution**:
- Enable "Install from Unknown Sources" in phone settings
- For release APKs, you need proper signing

#### App can't reach backend

**Check**:
1. Backend URL in Settings is correct
2. Phone and backend are on same network (for local testing)
3. Firewall allows connections
4. CORS is configured correctly in backend

**Testing backend connectivity**:
```bash
# From phone browser, test:
http://YOUR_BACKEND_IP:8000/health
```

### 11. Optimizing APK Size

To reduce APK size:

1. **Enable ProGuard** (in `android/app/build.gradle`):
```gradle
buildTypes {
    release {
        minifyEnabled true
        shrinkResources true
    }
}
```

2. **Use App Bundle** (smaller than APK):
```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

3. **Remove unused resources**:
   - Audit web assets in `dist/`
   - Remove unused images, fonts, libraries

## Automated Build Script

Create `build-apk.sh`:

```bash
#!/bin/bash

# Build APK for Simple Trader
set -e

echo "🔨 Building web application..."
npm run build

echo "🔄 Syncing with Capacitor..."
npx cap sync android

echo "📦 Building APK..."
cd android
./gradlew assembleDebug
cd ..

echo "✅ APK built successfully!"
echo "📍 Location: android/app/build/outputs/apk/debug/app-debug.apk"

# Optional: Install on connected device
read -p "Install on connected device? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    echo "✅ Installed on device!"
fi
```

Make it executable:
```bash
chmod +x build-apk.sh
```

Run it:
```bash
./build-apk.sh
```

## Continuous Integration (CI) Build

For automated builds in CI/CD:

### GitHub Actions Example

Create `.github/workflows/build-apk.yml`:

```yaml
name: Build Android APK

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Setup Java
      uses: actions/setup-java@v3
      with:
        distribution: 'temurin'
        java-version: '17'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build web app
      run: npm run build
    
    - name: Setup Android SDK
      uses: android-actions/setup-android@v2
    
    - name: Sync Capacitor
      run: npx cap sync android
    
    - name: Build APK
      run: |
        cd android
        ./gradlew assembleDebug
    
    - name: Upload APK
      uses: actions/upload-artifact@v3
      with:
        name: app-debug
        path: android/app/build/outputs/apk/debug/app-debug.apk
```

## Distribution

### For Personal Use (Samsung Galaxy S20)

- Use debug APK with USB installation
- No Play Store submission needed

### For Public Distribution

1. **Google Play Store**:
   - Create Developer Account ($25 one-time fee)
   - Build signed release AAB
   - Complete store listing
   - Submit for review

2. **Alternative Distribution**:
   - Host APK on your website
   - Use GitHub Releases
   - Use Firebase App Distribution
   - Use TestFlight (for iOS)

## Best Practices

1. **Version Management**: Update version in `package.json` and `android/app/build.gradle`
2. **Testing**: Test on multiple devices and Android versions
3. **Security**: Use HTTPS for all API calls
4. **Permissions**: Request only necessary Android permissions
5. **Size**: Keep APK under 50MB for better user experience
6. **Updates**: Implement in-app update checks

## Resources

- **Capacitor Docs**: https://capacitorjs.com/docs/android
- **Android Developer Guide**: https://developer.android.com/studio/build
- **Signing Guide**: https://developer.android.com/studio/publish/app-signing

---

**Note**: This build process creates a fully functional Android app that can run independently on your Samsung Galaxy S20, with or without network connectivity (though most features require network access to the backend).
