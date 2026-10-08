import copy
import math
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.config import Settings
from backend.contract import INPUT_VALIDATOR, OUTPUT_VALIDATOR
from backend.main import create_app
from test_api import fixture


class FinalWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(Settings.from_env()))
        self.addCleanup(self.client.close)
        self.layout = fixture("network-hotel")

    def post(self, route, payload):
        response = self.client.post('/api/' + route, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_signal_formula_and_heatmap_same_model(self):
        result = self.post('simulate', self.layout)
        OUTPUT_VALIDATOR.validate(result)
        link = result['geometry']['links'][0]
        self.assertAlmostEqual(link['rssi_dbm'], 14 - 40 - 30 * math.log10(link['distance_metres']))
        grid = result['heatmap']
        self.assertEqual(len(grid['cells']), grid['columns'] * grid['rows'])
        first = grid['cells'][0]
        x = first['x'] + grid['cell_width'] / 2
        y = first['y'] + grid['cell_height'] / 2
        gateway = self.layout['gateways'][0]
        expected = 14 - 40 - 30 * math.log10(max(1, math.hypot(x-gateway['x'], y-gateway['y']) * .05))
        self.assertAlmostEqual(first['rssi_dbm'], expected)
        self.layout['gateways'][0]['x'] = 700
        moved = self.post('simulate', self.layout)
        self.assertNotEqual(result['heatmap'], moved['heatmap'])

    def test_failure_and_backup_recovery_against_original_requirements(self):
        for _ in range(2):
            failed = self.post('failure', {'layout': self.layout, 'gateway_id': 'gateway_1'})
            self.assertTrue(failed['before']['requirements_evaluation']['pass'])
            self.assertEqual(failed['after']['summary']['coverage'], 0)
            self.assertEqual(failed['after']['summary']['reliability'], 0)
            self.assertIsNone(failed['after']['summary']['worst_latency_ms'])
            self.assertFalse(failed['after']['requirements_evaluation']['pass'])
            self.assertEqual(len(failed['affected_devices']), 6)
            self.assertTrue(all(cell['rssi_dbm'] is None for cell in failed['after']['heatmap']['cells']))
            recovered = self.post('failure', {'layout': failed['layout'], 'gateway_id': 'gateway_1', 'add_backup': True})
            self.assertTrue(recovered['recovered'])
            self.assertEqual(recovered['layout']['requirements'], self.layout['requirements'])
            self.assertFalse(recovered['layout']['gateways'][0]['active'])
            self.assertTrue(all(device['gateway_id'] == 'backup_gateway_1' for device in recovered['after']['devices']))
            INPUT_VALIDATOR.validate(recovered['layout'])
            OUTPUT_VALIDATOR.validate(recovered['after'])

    @patch('backend.planning.ask_ollama', side_effect=OSError('Model unavailable for explicit fallback test'))
    def test_fallback_design_is_labeled_and_cpp_verified(self, _):
        result = self.post('design', {'layout': self.layout,
            'prompt': 'Monitor temperature in all five rooms, detect bathroom leaks, within two seconds with 95% reliability.'})
        self.assertEqual(result['planner']['source'], 'deterministic_fallback')
        self.assertIn('Model unavailable', result['planner']['warning'])
        self.assertEqual(len(result['layout']['devices']), 6)
        self.assertEqual(result['layout']['requirements']['max_latency_ms'], 2000)
        self.assertEqual(result['layout']['requirements']['min_reliability'], .95)
        self.assertTrue(result['placement_validated'])
        self.assertTrue(result['simulation']['requirements_evaluation']['pass'])
        direct = self.post('simulate', result['layout'])
        self.assertEqual(result['simulation'], direct)

    @patch('backend.planning.ask_ollama')
    def test_ai_proposal_is_independently_verified(self, ask):
        ask.return_value = {'monitor_temperature': True, 'detect_leaks': True,
            'requirements': self.layout['requirements'], 'gateways': [{'x': 340, 'y': 320}], 'reasoning': 'Central placement'}
        result = self.post('design', {'layout': self.layout, 'prompt': 'Monitor all rooms and bathroom'})
        self.assertEqual(result['planner']['source'], 'ollama')
        self.assertEqual(result['simulation'], self.post('simulate', result['layout']))
        # This isolates the adapter; live Ollama acceptance is separate.

    @patch('backend.planning.ask_ollama')
    def test_out_of_floor_ai_proposal_is_rejected(self, ask):
        ask.return_value = {'monitor_temperature': True, 'detect_leaks': True,
            'requirements': self.layout['requirements'], 'gateways': [{'x': -999, 'y': 320}], 'reasoning': 'Invalid'}
        result = self.post('design', {'layout': self.layout, 'prompt': 'Monitor rooms'})
        self.assertEqual(result['planner']['source'], 'deterministic_fallback')
        self.assertIn('Rejected AI placement', result['planner']['warning'])
        self.assertGreaterEqual(result['layout']['gateways'][0]['x'], 0)

    @patch('backend.planning.ask_ollama', side_effect=OSError('Forced fallback'))
    def test_optimizer_improves_actual_weak_deployment(self, _):
        result = self.post('optimize', {'layout': fixture('weak-signal')})
        self.assertFalse(result['before']['requirements_evaluation']['pass'])
        self.assertTrue(result['improved'])
        self.assertTrue(result['after']['requirements_evaluation']['pass'])
        self.assertEqual(result['layout']['requirements'], self.layout['requirements'])
        self.assertEqual(len(result['layout']['gateways']), 1)
        self.assertEqual(result['planner']['source'], 'deterministic_fallback')
        self.assertEqual(result['after'], self.post('simulate', result['layout']))

    def test_invalid_envelopes_and_placement(self):
        for route, body in [('design', {}), ('design', {'layout': self.layout, 'prompt': 7}),
                            ('failure', {'layout': self.layout, 'gateway_id': 'missing'}),
                            ('failure', {'layout': self.layout, 'gateway_id': 'gateway_1', 'add_backup': 'true'})]:
            with self.subTest(route=route, body=body.keys()):
                response = self.client.post('/api/' + route, json=body)
                self.assertEqual(response.status_code, 422)
                OUTPUT_VALIDATOR.validate(response.json())
        invalid = copy.deepcopy(self.layout); invalid['gateways'][0]['x'] = -1
        response = self.client.post('/api/simulate', json=invalid)
        self.assertEqual(response.status_code, 422)
        self.assertIn('inside the floor', response.json()['error']['message'])

    def test_two_active_gateways_and_reassociation(self):
        self.layout['gateways'].append({'id': 'gateway_2', 'x': 340, 'y': 320, 'active': True})
        result = self.post('failure', {'layout': self.layout, 'gateway_id': 'gateway_1'})
        self.assertTrue(result['after']['requirements_evaluation']['pass'])
        self.assertEqual(result['affected_devices'], [])
        self.assertTrue(all(device['gateway_id'] == 'gateway_2' for device in result['after']['devices']))

    @patch('backend.planning.ask_ollama')
    def test_optimizer_does_not_invent_improvement_or_pass(self, ask):
        ask.return_value = {'gateways': [{'x': 990, 'y': 590}], 'reasoning': 'Deliberately poor proposal'}
        result = self.post('optimize', {'layout': self.layout})
        self.assertFalse(result['improved'])
        self.assertEqual(result['layout'], self.layout)
        self.assertEqual(result['before'], result['after'])
        self.layout['requirements']['max_latency_ms'] = 1
        impossible = self.post('optimize', {'layout': self.layout})
        self.assertFalse(impossible['after']['requirements_evaluation']['pass'])
        self.assertFalse(impossible['after']['requirements_evaluation']['checks']['latency'])

    @patch('backend.planning.ai_health', return_value={'available': False, 'model': 'absent', 'message': 'Unavailable'})
    def test_manual_simulation_without_ai(self, _):
        self.assertFalse(self.client.get('/api/ai/health').json()['available'])
        self.assertTrue(self.post('simulate', self.layout)['requirements_evaluation']['pass'])


if __name__ == '__main__': unittest.main()
