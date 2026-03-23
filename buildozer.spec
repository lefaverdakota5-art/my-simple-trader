[app]
title = Masterpiece Swarm Trader
package.name = swarmaggressor
package.domain = com.masterpiece.trading
source.dir = .
source.include_exts = py,png,jpg,kv,atlas,json,sql
version = 1.5.0

# Core requirements for AI + trading (Buildozer/Kivy build)
requirements = python3,kivy==2.3.0,requests,certifi,charset-normalizer,idna,urllib3

orientation = portrait
fullscreen = 0

android.permissions = INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK
android.api = 33
android.minapi = 21
android.sdk = 33
android.ndk = 25b
android.archs = arm64-v8a, armeabi-v7a
android.allow_backup = False
android.logcat_filters = *:S python:D

# Keep the bot running when the screen is off
# android.services = SwarmService:service.py

[buildozer]
log_level = 2
warn_on_root = 1
