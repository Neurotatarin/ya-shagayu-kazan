"""Deterministic Capacitor Android project, regenerated from the lockfile in CI."""
from pathlib import Path
import shutil, subprocess, json
import xml.etree.ElementTree as ET

repo=Path(__file__).resolve().parent.parent
project=repo/'android'
app=project/'app'
native=app/'src/main/java/ru/yashagayu/kazan/demo'
native.mkdir(parents=True,exist_ok=True)
for source in (repo/'native/android').glob('*.java'):shutil.copyfile(source,native/source.name)
manifest=app/'src/main/AndroidManifest.xml'
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
a='{http://schemas.android.com/apk/res/android}'
tree=ET.parse(manifest);root=tree.getroot();application=root.find('application')
for name in ['INTERNET','ACCESS_NETWORK_STATE','ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','FOREGROUND_SERVICE','FOREGROUND_SERVICE_MEDIA_PLAYBACK','WAKE_LOCK']:
    if not any(item.get(a+'name')=='android.permission.'+name for item in root.findall('uses-permission')):
        ET.SubElement(root,'uses-permission',{a+'name':'android.permission.'+name})
application.set(a+'allowBackup','false');application.set(a+'usesCleartextTraffic','false')
application.set(a+'label','Я шагаю по Казани')
service=next((node for node in application.findall('service') if node.get(a+'name')=='.KazanPlaybackService'),None)
if service is None:
    service=ET.SubElement(application,'service',{a+'name':'.KazanPlaybackService',a+'exported':'true',a+'foregroundServiceType':'mediaPlayback'})
    intent=ET.SubElement(service,'intent-filter');ET.SubElement(intent,'action',{a+'name':'androidx.media3.session.MediaSessionService'})
tree.write(manifest,encoding='utf-8',xml_declaration=True)
gradle=app/'build.gradle';text=gradle.read_text()
revision=subprocess.check_output(['git','rev-parse','--short=7','HEAD'],cwd=repo,text=True).strip()
count=int(subprocess.check_output(['git','rev-list','--count','HEAD'],cwd=repo,text=True).strip())
text=text.replace('versionCode 1',f'versionCode {1000+count}').replace('versionName "1.0"',f'versionName "0.4.{count}-{revision}"')
text+='''
android {
    buildFeatures { buildConfig true }
    compileOptions { coreLibraryDesugaringEnabled true }
}
dependencies {
    implementation "androidx.media3:media3-exoplayer:1.11.1"
    implementation "androidx.media3:media3-session:1.11.1"
    coreLibraryDesugaring "com.android.tools:desugar_jdk_libs:2.1.5"
    androidTestImplementation "androidx.test:rules:1.7.0"
    androidTestImplementation "androidx.test.uiautomator:uiautomator:2.3.0"
}
'''
gradle.write_text(text)
# Use the original character artwork, without redrawing or replacing it. An
# inset keeps the crown/ears inside Android's circular and squircle icon masks.
resource=app/'src/main/res';drawable=resource/'drawable';drawable.mkdir(exist_ok=True)
shutil.copyfile(repo/'app/public/branding/app-icon.png',drawable/'kazan_original_icon.png')
for folder in ['mipmap-anydpi','mipmap-anydpi-v26']:
    destination=resource/folder;destination.mkdir(exist_ok=True)
    for name in ['ic_launcher','ic_launcher_round']:
        if folder.endswith('v26'):
            xml='''<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/kazan_icon_background"/><foreground><inset android:drawable="@drawable/kazan_original_icon" android:inset="17%"/></foreground></adaptive-icon>'''
        else:xml='''<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@drawable/kazan_original_icon" android:gravity="fill"/>'''
        (destination/(name+'.xml')).write_text(xml)
(resource/'values/kazan.xml').write_text('<resources><color name="kazan_icon_background">#DEF4E5</color></resources>')
# Replace the generated Capacitor splash with the existing brand artwork.
for splash in resource.glob('drawable*/splash.png'):splash.unlink()
(drawable/'splash.xml').write_text('''<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@android:color/white"/><item android:width="96dp" android:height="96dp" android:gravity="center"><bitmap android:src="@drawable/kazan_original_icon" android:gravity="fill"/></item></layer-list>''')
# nginx precompression is only for the web host. AAPT treats foo.svg.gz and
# foo.svg as the same asset. APK already compresses assets itself.
public=app/'src/main/assets/public'
for item in public.rglob('*'):
    if item.suffix in ('.gz','.br') and item.is_file():item.unlink()
print('Android configured:',revision,'minSdk 24, targetSdk 36; release contains no test harness')
