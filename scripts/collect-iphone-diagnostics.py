"""Bounded, redacted test-only WebKit diagnostics; no user/device credentials."""
from pathlib import Path
import json
import re
import subprocess
import sys
import time

stage = Path('work/native-checks'); stage.mkdir(parents=True, exist_ok=True)
predicate = '(process CONTAINS "WebContent" OR process CONTAINS "WebKit" OR process == "App") AND (eventMessage CONTAINS[c] "terminat" OR eventMessage CONTAINS[c] "GPU" OR eventMessage CONTAINS[c] "memory" OR eventMessage CONTAINS[c] "WebGL" OR eventMessage CONTAINS[c] "worker" OR eventMessage CONTAINS[c] "context")'
try:
    result = subprocess.run(['xcrun', 'simctl', 'spawn', sys.argv[1], 'log', 'show', '--last', '10m', '--style', 'compact', '--predicate', predicate], capture_output=True, timeout=30)
    content = (result.stdout + result.stderr).decode('utf-8', errors='replace')[-500_000:]
    content = re.sub(r'(?i)(?:gh[pousr]_|github_pat_|sk-(?:proj-)?)[A-Za-z0-9_-]{12,}', '[redacted]', content)
    content = re.sub(r'(?i)authorization[^\n]+', 'authorization [redacted]', content)
    content = re.sub(r'[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{15,}', '[redacted]', content)
    (stage / 'webkit-system.log').write_text(content)
except (subprocess.TimeoutExpired, OSError):
    (stage / 'webkit-system.log').write_text('Diagnostic log unavailable within the bounded check.\n')

summaries = []
directory = Path.home() / 'Library/Logs/DiagnosticReports'
for path in sorted(directory.glob('*.ips'), key=lambda path: path.stat().st_mtime, reverse=True):
    if time.time() - path.stat().st_mtime > 1200 or not any(name in path.name for name in ('WebKit', 'WebContent', 'App-')):
        continue
    try:
        text = path.read_text()
        try: data = json.loads(text)
        except json.JSONDecodeError: data = json.loads(text.split('\n', 1)[1])
        exception = data.get('exception', {}); termination = data.get('termination', {})
        frames = [frame.get('symbol', '') for thread in data.get('threads', []) if thread.get('triggered') for frame in thread.get('frames', [])][:30]
        summaries.append({'process': data.get('procName'), 'exceptionType': exception.get('type'), 'signal': exception.get('signal'), 'terminationNamespace': termination.get('namespace'), 'terminationCode': termination.get('code'), 'terminationIndicator': termination.get('indicator'), 'triggeredSymbols': frames})
    except (OSError, ValueError, TypeError):
        continue
    if len(summaries) >= 5: break
(stage / 'crash-summary.json').write_text(json.dumps(summaries, indent=2))
