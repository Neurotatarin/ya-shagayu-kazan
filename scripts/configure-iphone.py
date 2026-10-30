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
source += '\n' + marker + '\n' + (repository / 'native/ios/KazanAudioPlugin.swift').read_text(encoding='utf-8') + '\n// END KAZAN AUDIO\n'
delegate.write_text(source, encoding='utf-8')

storyboard = app / 'Base.lproj' / 'Main.storyboard'
tree = ET.parse(storyboard)
controllers = tree.findall('.//viewController')
controller = next(c for c in controllers if c.get('customClass') in ('CAPBridgeViewController', 'KazanBridgeViewController'))
controller.set('customClass', 'KazanBridgeViewController')
controller.set('customModule', 'App')
controller.set('customModuleProvider', 'target')
tree.write(storyboard, encoding='utf-8', xml_declaration=True)
print('Configured native audio bridge, background playback and location usage description.')
