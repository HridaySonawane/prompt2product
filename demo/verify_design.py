r"""Real Ollama + C++ design acceptance, without restarting the user's server.

From the repository root:
  backend\.venv\Scripts\python.exe demo/verify_design.py
  backend\.venv\Scripts\python.exe demo/verify_design.py --url http://127.0.0.1:8000

Default: HTTP requests through FastAPI TestClient using current source. --url
tests an already restarted live backend. Neither mode accepts fallback as AI.
"""
import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.config import Settings
from backend.contract import INPUT_VALIDATOR, OUTPUT_VALIDATOR
from backend.design_layout import actual_counts
from backend.main import create_app
from backend.simulator import SimulatorRunner


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', help='Existing app URL; otherwise use fresh source via TestClient')
    parser.add_argument('--output', default=str(ROOT / 'demo/build/design-acceptance.json'))
    args = parser.parse_args()
    if args.url:
        import httpx
        client = httpx.Client(base_url=args.url.rstrip('/'), timeout=180)
    else:
        from fastapi.testclient import TestClient
        client = TestClient(create_app(Settings.from_env()))
    runner = SimulatorRunner(Settings.from_env())
    layout = json.loads((ROOT / 'shared/fixtures/network-hotel.json').read_text(encoding='utf-8'))
    cases = [
        ('simple 2 rooms, 1 bathroom, 1 lobby, 1 gateway, clean design',
         {'room': 2, 'bathroom': 1, 'lobby': 1, 'reception': 0, 'gateways': 1}, 3),
        ('Design three guest rooms, one bathroom, one lobby, and two gateways.',
         {'room': 3, 'bathroom': 1, 'lobby': 1, 'reception': 0, 'gateways': 2}, 4),
        ('simple 2 rooms, 1 bathroom, 1 lobby, 1 gateway, clean design',
         {'room': 2, 'bathroom': 1, 'lobby': 1, 'reception': 0, 'gateways': 1}, 3),
    ]
    evidence = {'transport': args.url or 'FastAPI TestClient (current source)', 'cases': []}
    with client:
        health = client.get('/api/ai/health')
        health.raise_for_status()
        assert health.json()['available'], health.text
        for prompt, expected, devices in cases:
            started = time.monotonic()
            response = client.post('/api/design', json={'layout': layout, 'prompt': prompt})
            response.raise_for_status()
            result = response.json()
            assert result['planner']['source'] == 'ollama', result['planner']
            assert result['design_request']['matched']
            assert result['design_request']['mode'] == 'new_layout'
            assert actual_counts(result['layout']) == expected, result['design_request']
            assert len(result['layout']['devices']) == devices
            assert result['layout']['walls'] == []
            assert all(link['walls_crossed'] == 0 and link['wall_attenuation_db'] == 0
                       for link in result['simulation']['geometry']['links'])
            INPUT_VALIDATOR.validate(result['layout'])
            OUTPUT_VALIDATOR.validate(result['simulation'])
            # The returned metrics must be precisely the final positions' C++ run.
            status, direct = runner.run(result['layout'])
            assert status == 200 and direct == result['simulation']
            evidence['cases'].append({'prompt': prompt, 'seconds': round(time.monotonic() - started, 3),
                'counts': actual_counts(result['layout']), 'result': result})
            layout = result['layout']
            print('PASS:', prompt, '|', expected, '| walls: 0 | model:', result['planner']['model'], flush=True)
        response = client.post('/api/design', json={'layout': layout, 'prompt': '2 rooms, 3 gateways'})
        assert response.status_code == 422, response.text
        OUTPUT_VALIDATOR.validate(response.json())
        evidence['unsupported_gateways'] = response.json()
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    print('PASS: unsupported counts return structured HTTP 422; evidence:', target)


if __name__ == '__main__':
    main()
