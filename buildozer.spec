# (stru) # 

# buildozer.spec

[app]
# (str) Title of your application
title = My Application

# (str) Package name
package.name = my_app

# (str) Package domain
package.domain = org.test

# (list) source.include_exts
source.include_exts = py,png,jpg,kv,atlas

# (list) source.exclude_exts
source.exclude_exts = spec,pdb,pyc,html

# (str) version number
version = 0.1

# (str) application version code
version.code = 1

# (str) description
description = My Application description

# (bool) Android specific permissions
android.permissions = INTERNET,READ_EXTERNAL_STORAGE,WRITE_EXTERNAL_STORAGE,ACCESS_FINE_LOCATION

# (list) Android private libraries
android.private_libraries = 

# (list) Android requirements
requirements = python3,kivy

# (str) Android API
android.api = 30

# (str) Android NDK
android.ndk = 21b

# (str) Android minimum API
android.minapi = 21

# (str) Android target API
android.targetapi = 30

# (str) Android application package
android.package = org.test.my_app

# (str) Android application icon
android.icon = icons/myicon.png

# (str) Android theme
android.theme = @android:style/Theme.NoTitleBar

# (str) Android orientation
android.orientation = portrait

# (str) the main .py file to execute
android.entrypoint = main.py

# (str) Kivy version: if omitted, the latest supported version is used
kivy = 2.0.0
