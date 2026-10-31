"""Ready a disposable CI emulator before installing the application.

First-boot Launcher/System UI ANRs are recorded and recovered here, while our
app is not installed. Application ANRs are never dismissed by this helper.
"""
from pathlib import Path
import json,re,subprocess,time,xml.etree.ElementTree as ET
root=Path('work/emulator-startup');root.mkdir(parents=True,exist_ok=True)
def adb(*args):return subprocess.check_output(['adb',*args],timeout=40)
def snapshot(index):
    adb('shell','uiautomator','dump','/sdcard/startup.xml')
    raw=adb('exec-out','cat','/sdcard/startup.xml');(root/f'{index}.xml').write_bytes(raw)
    return ET.fromstring(raw)
assert b'ru.yashagayu.kazan.demo' not in adb('shell','pm','list','packages','ru.yashagayu.kazan.demo')
time.sleep(15);recovered=[]
for attempt in range(4):
    tree=snapshot(attempt)
    titles=[n.get('text','') for n in tree.iter('node') if n.get('resource-id')=='android:id/alertTitle']
    if not any("isn't responding" in title or 'not responding' in title for title in titles):
        # A second idle sample prevents starting under an about-to-appear ANR.
        time.sleep(5);second=snapshot(str(attempt)+'-idle')
        if not any("isn't responding" in n.get('text','') for n in second.iter('node')):break
        tree=second;titles=[n.get('text','') for n in tree.iter('node') if n.get('resource-id')=='android:id/alertTitle']
    assert titles and all(any(name in title for name in ['Quickstep','Launcher','System UI']) for title in titles), 'Unexpected startup dialog; not dismissed'
    (root/f'{attempt}.png').write_bytes(adb('exec-out','screencap','-p'))
    target='android:id/aerr_close' if any('Quickstep' in title or 'Launcher' in title for title in titles) else 'android:id/aerr_wait'
    node=next(n for n in tree.iter('node') if n.get('resource-id')==target)
    box=[int(x) for x in re.findall(r'\d+',node.get('bounds',''))]
    adb('shell','input','tap',str((box[0]+box[2])//2),str((box[1]+box[3])//2));recovered.extend(titles)
    time.sleep(8);adb('shell','input','keyevent','3');time.sleep(5)
else:raise RuntimeError('Disposable emulator system is not ready')
(root/'result.json').write_text(json.dumps({'ready':True,'recoveredBeforeAppInstall':recovered},indent=2))
(root/'startup-log.txt').write_bytes(adb('logcat','-d','-b','crash'))
adb('logcat','-c')
print('Disposable Android system ready; application not yet installed.')
