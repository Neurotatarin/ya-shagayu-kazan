"""Prefer the XR/11 display class; touch only the disposable CI simulator."""
from pathlib import Path
import json
import platform
import subprocess

def sim_list(kind):
    return json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', kind, '-j'], text=True))

devices = sim_list('devices')['devices']
runtimes = [runtime for runtime in sim_list('runtimes')['runtimes'] if runtime.get('isAvailable') and 'iOS' in runtime['name']]
candidates = [(runtime, device) for runtime, entries in devices.items() for device in entries if device.get('isAvailable') and 'iPhone' in device['name']]
preferred = next(((runtime, device) for runtime, device in candidates if device['name'] == 'iPhone XR' and 'iOS-18' in runtime), None)
preferred = preferred or next(((runtime, device) for runtime, device in candidates if device['name'] == 'iPhone 11'), None)
created = False
if preferred is None:
    device_type = next((entry for entry in sim_list('devicetypes')['devicetypes'] if entry['name'] == 'iPhone 11'), None)
    runtime = next((entry for entry in runtimes if entry.get('version', '').startswith('18.')), None) or (runtimes[-1] if runtimes else None)
    if device_type and runtime:
        try:
            identifier = subprocess.check_output(['xcrun', 'simctl', 'create', 'Kazan Offline Check', device_type['identifier'], runtime['identifier']], text=True, stderr=subprocess.DEVNULL).strip()
            preferred = runtime['identifier'], {'name': device_type['name'], 'udid': identifier}
            created = True
        except subprocess.CalledProcessError:
            pass
runtime, device = preferred or candidates[0]
stage = Path('work/native-checks'); stage.mkdir(parents=True, exist_ok=True)
(stage / 'environment.json').write_text(json.dumps({'device': device['name'], 'runtime': runtime, 'hostArchitecture': platform.machine(), 'createdForThisCheck': created}, indent=2))
print(device['udid'])
