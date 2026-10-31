"""Exercise the actual installed Capacitor templates, without Xcode or secrets."""
from pathlib import Path
import plistlib
import subprocess
import sys
import tarfile
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent


class IphoneConfigurationTest(unittest.TestCase):
    def test_scene_launches_the_controller_that_registers_audio(self):
        for template in ('ios-spm-template.tar.gz', 'ios-pods-template.tar.gz'):
            with self.subTest(template=template), tempfile.TemporaryDirectory() as temporary:
                project = Path(temporary)
                app = project / 'ios/App/App'
                app.mkdir(parents=True)
                archive = ROOT / 'node_modules/@capacitor/cli/assets' / template
                with tarfile.open(archive) as source:
                    for name in ('AppDelegate.swift', 'SceneDelegate.swift', 'Info.plist', 'Base.lproj/Main.storyboard'):
                        member = next(m for m in source.getmembers() if m.name.endswith('/App/' + name))
                        path = app / name
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_bytes(source.extractfile(member).read())

                def configure():
                    subprocess.run([sys.executable, str(ROOT / 'scripts/configure-iphone.py'), str(project)], check=True, capture_output=True)

                configure()
                scene = (app / 'SceneDelegate.swift').read_text(encoding='utf-8')
                self.assertIn('window?.rootViewController = KazanBridgeViewController()', scene)
                self.assertNotIn('window?.rootViewController = CAPBridgeViewController()', scene)
                self.assertIn('SceneDelegateProxy.shared.scene(scene, willConnectTo:', scene)
                delegate = (app / 'AppDelegate.swift').read_text(encoding='utf-8')
                self.assertIn('bridge?.registerPluginInstance(KazanAudioPlugin())', delegate)
                self.assertIn('bridge?.registerPluginInstance(KazanOfflinePlugin())', delegate)
                self.assertEqual(delegate.count('class KazanBridgeViewController:'), 1)
                info = plistlib.loads((app / 'Info.plist').read_bytes())
                self.assertIn('audio', info['UIBackgroundModes'])
                controller = ET.parse(app / 'Base.lproj/Main.storyboard').find('.//viewController')
                self.assertEqual(controller.get('customClass'), 'KazanBridgeViewController')
                before = {name: (app / name).read_bytes() for name in ('AppDelegate.swift', 'SceneDelegate.swift', 'Info.plist', 'Base.lproj/Main.storyboard')}
                configure()
                self.assertEqual(before, {name: (app / name).read_bytes() for name in before})


if __name__ == '__main__':
    unittest.main()
