"""Black-box installation of the exact signed APK offered to the user.

No debugging bridge, injected JS, API credentials or rebuilt replacement APK.
"""
from pathlib import Path
import hashlib,json,re,subprocess,sys,time,urllib.request,xml.etree.ElementTree as ET

root=Path('work/android-release-check');root.mkdir(parents=True,exist_ok=True)
release=json.loads(Path('deployment/android-release.json').read_text())
assert re.fullmatch(r'https://kazan-demo\.38-180-191-162\.sslip\.io/downloads/YaShagayuKazan-[0-9a-f]{7}\.apk',release['url'])
package='ru.yashagayu.kazan.demo'
def adb(*args):return subprocess.check_output(['adb',*args],text=True,stderr=subprocess.STDOUT,timeout=60)
def snapshot():
    adb('shell','uiautomator','dump','/sdcard/kazan-release-ui.xml')
    raw=adb('exec-out','cat','/sdcard/kazan-release-ui.xml');(root/'ui.xml').write_text(raw)
    return ET.fromstring(raw)
def find(label,timeout=60):
    start=time.monotonic()
    while time.monotonic()-start<timeout:
        tree=snapshot()
        for node in tree.iter('node'):
            if label in (node.get('text'),node.get('content-desc')) and node.get('enabled')=='true':
                box=[int(n) for n in re.findall(r'\d+',node.get('bounds',''))]
                if len(box)==4 and box[2]>box[0] and box[3]>box[1]:return box
        time.sleep(.5)
    raise RuntimeError('Release UI missing: '+label)
def tap(label):
    box=find(label);adb('shell','input','tap',str((box[0]+box[2])//2),str((box[1]+box[3])//2))
def screen(name):
    result=subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=30);(root/(name+'.png')).write_bytes(result)
def playing():
    raw=adb('shell','dumpsys','media_session');(root/'media-session.txt').write_text(raw)
    return package in raw and re.search(r'\bstate=3\b',raw) is not None

if sys.argv[1]=='download':
    with urllib.request.urlopen(release['url'],timeout=120) as response:data=response.read()
    assert len(data)==release['bytes'] and hashlib.sha256(data).hexdigest()==release['sha256']
    (root/'app.apk').write_bytes(data);(root/'release.json').write_text(json.dumps(release,indent=2))
elif sys.argv[1]=='certificate':
    text=(root/'signature.txt').read_text();assert release['certificateSHA256'] in text
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in text
elif sys.argv[1]=='install':
    try:
        time.sleep(15) # Let the freshly booted system finish its first frame/dex work.
        assert 'Success' in adb('install','-r',str(root/'app.apk'))
        status=adb('shell','am','start','-W','-n',package+'/.MainActivity');assert 'Status: ok' in status
        find('Начать прогулку');screen('release-home');tap('Начать прогулку')
        find('Выбрать Дом Ушковой');screen('release-map');tap('Выбрать Дом Ушковой');tap('Слушать')
        for _ in range(4):
            try:find('Воспроизвести историю',timeout=6);break
            except RuntimeError:adb('shell','input','swipe','530','1850','530','900','350')
        tap('Воспроизвести историю');time.sleep(5)
        assert playing(),'Signed release did not start native media session'
        screen('release-player');adb('shell','input','keyevent','3');adb('shell','input','keyevent','223');time.sleep(8)
        assert playing(),'Signed release lost playback in background'
        adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');screen('release-locked-media')
        crash=adb('logcat','-d','-b','crash');(root/'crashes.txt').write_text(crash)
        assert 'FATAL EXCEPTION' not in crash and 'Fatal signal' not in crash
        (root/'result.json').write_text(json.dumps({'ok':True,'signedAPKInstalled':True,'exactSHA256':release['sha256'],'releaseUI':True,'nativeMediaSession':True,'background':True,'androidAPI':36},indent=2))
    finally:
        screen('release-final-state')
        (root/'launch-log.txt').write_text(adb('logcat','-d','-s','AndroidRuntime','Capacitor/Console'))
else:raise RuntimeError('Unknown phase')
