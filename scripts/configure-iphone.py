from pathlib import Path
import plistlib
import sys
import xml.etree.ElementTree as ET

repository = Path(__file__).resolve().parent.parent
project = Path(sys.argv[1]) if len(sys.argv) > 1 else repository
app = project / 'ios' / 'App' / 'App'
info_path = app / 'Info.plist'
info = plistlib.loads(info_path.read_bytes())
info['UIUserInterfaceStyle'] = 'Light'
info['NSLocationWhenInUseUsageDescription'] = 'Показать твоё местоположение и пешеходный путь к достопримечательностям Казани.'
info['UIBackgroundModes'] = sorted(set(info.get('UIBackgroundModes', [])) | {'audio'})
info_path.write_bytes(plistlib.dumps(info))

# AppDelegate is already compiled by the generated Capacitor project. Keeping
# this insertion deterministic avoids an Xcode-only manual file-registration step.
delegate = app / 'AppDelegate.swift'
source = delegate.read_text(encoding='utf-8')
marker = '// BEGIN KAZAN AUDIO'
if marker in source:
    source = source[:source.index(marker)].rstrip() + '\n'
native_sources = ['KazanAudioPlugin.swift', 'KazanOfflinePlugin.swift']
source += '\n' + marker + '\n' + '\n'.join((repository / 'native/ios' / name).read_text(encoding='utf-8') for name in native_sources) + '\n// END KAZAN AUDIO\n'
delegate.write_text(source, encoding='utf-8')

# Capacitor 8.5 creates the active controller in SceneDelegate, replacing the
# storyboard controller. Registering only the latter silently loses local plugins.
scene_delegate = app / 'SceneDelegate.swift'
scene_source = scene_delegate.read_text(encoding='utf-8')
original = 'window?.rootViewController = CAPBridgeViewController()'
configured = 'window?.rootViewController = KazanBridgeViewController()'
if original in scene_source:
    if scene_source.count(original) != 1:
        raise RuntimeError('Unexpected Capacitor scene template: multiple root controllers')
    scene_source = scene_source.replace(original, configured)
elif scene_source.count(configured) != 1:
    raise RuntimeError('Unexpected Capacitor scene template: audio controller not configured')
scene_delegate.write_text(scene_source, encoding='utf-8')

# Keep the storyboard consistent for any legacy launch path too.
storyboard = app / 'Base.lproj' / 'Main.storyboard'
tree = ET.parse(storyboard)
controllers = tree.findall('.//viewController')
controller = next(c for c in controllers if c.get('customClass') in ('CAPBridgeViewController', 'KazanBridgeViewController'))
controller.set('customClass', 'KazanBridgeViewController')
controller.set('customModule', 'App')
controller.set('customModuleProvider', 'target')
tree.write(storyboard, encoding='utf-8', xml_declaration=True)
print('Configured native audio bridge, background playback and location usage description.')
