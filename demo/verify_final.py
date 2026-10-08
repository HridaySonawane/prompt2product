"""Live acceptance: real HTTP -> real C++, plus optional required real Ollama.

Run from repo root: backend/.venv/Scripts/python.exe demo/verify_final.py --require-ai
The server must already be running. Repeats the full workflow twice.
"""
import argparse
import json
import re
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from backend.contract import INPUT_VALIDATOR, OUTPUT_VALIDATOR


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--require-ai', action='store_true')
    args = parser.parse_args()
    def request(path, payload=None):
        req = urllib.request.Request(args.url + path,
            data=None if payload is None else json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=180) as response:
            assert response.status == 200
            return json.load(response)
    records = []
    health = request('/api/health'); assert health['simulator_available']
    ai = request('/api/ai/health')
    if args.require_ai: assert ai['available'], ai
    with urllib.request.urlopen(args.url + '/') as response:
        html = response.read().decode('utf-8')
        assert '<div id="root">' in html, 'Built frontend not served'
    assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
    assert assets, 'Production asset links missing'
    for asset in assets:
        with urllib.request.urlopen(args.url + asset) as response:
            assert response.status == 200 and len(response.read()) > 0, 'Production asset missing: ' + asset
    def assert_placement(candidate):
        for device in candidate['devices']:
            room = next(r for r in candidate['rooms'] if r['id'] == device['room_id'])
            assert room['x'] <= device['x'] <= room['x'] + room['width']
            assert room['y'] <= device['y'] <= room['y'] + room['height']
        for gateway in candidate['gateways']:
            assert any(r['x'] + min(24, r['width']/2) <= gateway['x'] <= r['x'] + r['width'] - min(24, r['width']/2)
                and r['y'] + min(24, r['height']/2) <= gateway['y'] <= r['y'] + r['height'] - min(24, r['height']/2)
                for r in candidate['rooms']), 'Gateway marker outside area interior'
    for index in range(2):
        layout = json.loads((ROOT / 'shared/fixtures/network-hotel.json').read_text())
        # Minor room customization happens through the same contract as UI edits.
        layout['rooms'][0]['name'] = 'Guest suite ' + str(index + 1)
        design = request('/api/design', {'layout': layout, 'prompt':
            'Monitor temperature in all five rooms, detect bathroom leaks, and deliver alerts within two seconds with at least 95% reliability.'})
        if args.require_ai: assert design['planner']['source'] == 'ollama', design['planner']
        INPUT_VALIDATOR.validate(design['layout']); OUTPUT_VALIDATOR.validate(design['simulation'])
        assert_placement(design['layout'])
        assert len(design['layout']['devices']) == 6
        assert design['simulation']['requirements_evaluation']['pass']
        again = request('/api/simulate', design['layout'])
        assert again == design['simulation'], 'Same request produced different C++ results'
        weak = json.loads((ROOT / 'shared/fixtures/weak-signal.json').read_text())
        optimized = request('/api/optimize', {'layout': weak, 'prompt':
            'Improve this weak deployment using actual C++ feedback. Prefer one gateway.'})
        if args.require_ai: assert optimized['planner']['source'] == 'ollama', optimized['planner']
        assert not optimized['before']['requirements_evaluation']['pass']
        assert optimized['improved'] and optimized['after']['requirements_evaluation']['pass']
        assert optimized['layout']['requirements'] == weak['requirements']
        assert_placement(optimized['layout'])
        assert optimized['after'] == request('/api/simulate', optimized['layout'])
        assert optimized['before']['heatmap'] != optimized['after']['heatmap']
        failed = request('/api/failure', {'layout': optimized['layout'], 'gateway_id': 'gateway_1'})
        assert failed['after']['summary']['coverage'] == 0
        assert failed['after']['summary']['reliability'] == 0
        assert failed['after']['summary']['worst_latency_ms'] is None
        assert not failed['after']['requirements_evaluation']['pass']
        recovered = request('/api/failure', {'layout': failed['layout'], 'gateway_id': 'gateway_1', 'add_backup': True})
        assert recovered['recovered'] and recovered['after']['requirements_evaluation']['pass']
        assert not recovered['layout']['gateways'][0]['active']
        assert recovered['layout']['requirements'] == weak['requirements']
        assert_placement(recovered['layout'])
        assert recovered['after'] == request('/api/simulate', recovered['layout'])
        records.append({'design': design, 'optimization': optimized, 'failure': failed, 'recovery': recovered})
        print(f'PASS workflow {index+1}: AI design -> real simulation -> verified optimization -> gateway failure -> backup recovery', flush=True)
        print(json.dumps({'ai_design': design['planner']['source'], 'ai_optimization': optimized['planner']['source'],
            'before': optimized['before']['summary'], 'after': optimized['after']['summary'], 'recovered': recovered['after']['summary']}), flush=True)
    evidence = ROOT / 'demo/build/live-acceptance.json'
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps({'health': health, 'ai': ai, 'runs': records}, indent=2), encoding='utf-8')
    print('PASS both complete live workflows. Evidence:', evidence)


if __name__ == '__main__': main()
