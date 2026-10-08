"""Count semantics + actual C++ verification; AI doubles are explicitly isolated."""
import copy
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.config import Settings
from backend.contract import INPUT_VALIDATOR, OUTPUT_VALIDATOR
from backend.design_layout import actual_counts, build_layout, explicit_counts, verify_counts
from backend.main import create_app
from test_api import fixture


PROMPT = 'simple 2 rooms, 1 bathroom, 1 lobby, 1 gateway, clean design'
EXPECTED = {'room': 2, 'bathroom': 1, 'lobby': 1, 'reception': 0, 'gateways': 1}


class LayoutCountTests(unittest.TestCase):
    def test_exact_screenshot_prompt_and_word_counts(self):
        self.assertEqual(explicit_counts(PROMPT), EXPECTED)
        self.assertEqual(explicit_counts('two guest rooms, a bathroom, a lobby, single gateway'), EXPECTED)
        self.assertEqual(explicit_counts('two small guest rooms, one large bathroom, one lobby, one gateway'), EXPECTED)
        self.assertEqual(explicit_counts('3 bedrooms, no washrooms, two gateways'),
                         {'room': 3, 'bathroom': 0, 'lobby': 0, 'reception': 0, 'gateways': 2})

    def test_monitoring_references_do_not_replace_building(self):
        for prompt in ('Monitor temperature in all five rooms and bathroom leaks',
                       'Monitor all rooms', '95% reliability within 2 seconds', 'monitor existing 5 rooms'):
            with self.subTest(prompt=prompt):
                self.assertEqual(explicit_counts(prompt), {})

    def test_invalid_or_conflicting_counts_rejected(self):
        for prompt in ('2 rooms, 3 rooms', '-2 rooms', '1.5 rooms', '0 rooms', '33 rooms',
                       '2 rooms, 0 gateways', '2 rooms, 3 gateways', '9' * 350 + ' rooms',
                       'twenty-one rooms', 'twenty one rooms', 'one hundred rooms'):
            with self.subTest(prompt=prompt), self.assertRaises(ValueError):
                explicit_counts(prompt)

    def test_room_only_request_has_no_unrequested_areas(self):
        counts = explicit_counts('make 2 rooms')
        self.assertEqual(counts, {'room': 2, 'bathroom': 0, 'lobby': 0, 'reception': 0})

    def test_gateway_only_request_keeps_building(self):
        layout = fixture('network-hotel')
        candidate = build_layout(layout, explicit_counts('Use two gateways'))
        self.assertEqual(candidate, layout)
        self.assertIsNot(candidate, layout)

    def test_generated_areas_fit_without_overlap_and_do_not_generate_walls(self):
        layout = fixture('network-hotel')
        original = copy.deepcopy(layout)
        for prompt in (PROMPT, '1 room', '30 rooms, 1 lobby, 1 bathroom', '2 rooms, 1 reception'):
            candidate = build_layout(layout, explicit_counts(prompt))
            self.assertEqual(candidate['floor'], layout['floor'])
            self.assertEqual(candidate['simulation'], layout['simulation'])
            self.assertEqual(candidate['walls'], [])
            for index, room in enumerate(candidate['rooms']):
                self.assertGreaterEqual(room['x'], 16)
                self.assertGreaterEqual(room['y'], 16)
                self.assertGreaterEqual(room['width'], 64)
                self.assertGreaterEqual(room['height'], 64)
                self.assertLessEqual(room['x'] + room['width'], layout['floor']['width'])
                self.assertLessEqual(room['y'] + room['height'], layout['floor']['height'])
                for other in candidate['rooms'][index+1:]:
                    self.assertTrue(room['x'] + room['width'] + 15.999 <= other['x'] or
                        other['x'] + other['width'] + 15.999 <= room['x'] or
                        room['y'] + room['height'] + 15.999 <= other['y'] or
                        other['y'] + other['height'] + 15.999 <= room['y'])
            reception = candidate['reception']
            self.assertTrue(any(r['x'] <= reception['x'] <= r['x'] + r['width'] and
                r['y'] <= reception['y'] <= r['y'] + r['height'] for r in candidate['rooms']))
        self.assertEqual(layout, original)

    def test_impossible_floor_rejected(self):
        layout = fixture('network-hotel')
        layout['floor'] = {'width': 100, 'height': 100}
        with self.assertRaisesRegex(ValueError, 'do not fit'):
            build_layout(layout, explicit_counts(PROMPT))
        layout['floor'] = {'width': 96, 'height': 96}
        candidate = build_layout(layout, explicit_counts('1 room'))
        room, point = candidate['rooms'][0], candidate['reception']
        self.assertTrue(room['x'] + 24 <= point['x'] <= room['x'] + room['width'] - 24)
        self.assertTrue(room['y'] + 24 <= point['y'] <= room['y'] + room['height'] - 24)

    def test_mismatched_result_cannot_claim_success(self):
        with self.assertRaisesRegex(ValueError, 'does not match'):
            verify_counts(fixture('network-hotel'), EXPECTED)


class DesignIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.layout = fixture('network-hotel')
        self.client = TestClient(create_app(Settings.from_env()))
        self.addCleanup(self.client.close)

    def post(self, prompt):
        response = self.client.post('/api/design', json={'layout': self.layout, 'prompt': prompt})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        INPUT_VALIDATOR.validate(result['layout'])
        OUTPUT_VALIDATOR.validate(result['simulation'])
        direct = self.client.post('/api/simulate', json=result['layout'])
        self.assertEqual(direct.status_code, 200, direct.text)
        self.assertEqual(result['simulation'], direct.json())
        self.assertTrue(result['design_request']['matched'])
        return result

    @patch('backend.planning.ask_ollama')
    def test_requested_counts_replace_default_and_real_cpp_verifies(self, ask):
        ask.return_value = {'monitor_temperature': True, 'detect_leaks': True,
            'requirements': self.layout['requirements'], 'gateways': [{'x': 500, 'y': 300}], 'reasoning': 'Central gateway'}
        result = self.post(PROMPT)
        self.assertEqual(result['planner']['source'], 'ollama')
        self.assertEqual(result['design_request']['mode'], 'new_layout')
        self.assertEqual(actual_counts(result['layout']), EXPECTED)
        self.assertEqual(len(result['layout']['devices']), 3)
        self.assertEqual(result['layout']['walls'], [])
        self.assertTrue(all(link['walls_crossed'] == 0 and link['wall_attenuation_db'] == 0
                            for link in result['simulation']['geometry']['links']))
        self.assertEqual(result['simulation']['summary']['total_devices'], 3)
        self.assertEqual(self.layout, fixture('network-hotel'))

    @patch('backend.planning.ask_ollama', side_effect=OSError('Forced fallback'))
    def test_fallback_preserves_requested_counts_including_two_gateways(self, _):
        result = self.post('three rooms, one bathroom, one lobby, two gateways')
        self.assertEqual(result['planner']['source'], 'deterministic_fallback')
        self.assertEqual(actual_counts(result['layout']),
            {'room': 3, 'bathroom': 1, 'lobby': 1, 'reception': 0, 'gateways': 2})
        self.assertEqual(len(result['layout']['devices']), 4)
        self.assertEqual(result['layout']['walls'], [])

    @patch('backend.planning.ask_ollama')
    def test_incorrect_ai_gateway_count_is_labeled_fallback(self, ask):
        ask.return_value = {'monitor_temperature': True, 'detect_leaks': True,
            'requirements': self.layout['requirements'], 'gateways': [{'x': 500, 'y': 300}], 'reasoning': 'One'}
        result = self.post('2 rooms, two gateways')
        self.assertEqual(len(result['layout']['gateways']), 2)
        self.assertEqual(result['planner']['source'], 'deterministic_fallback')
        self.assertIn('gateway count', result['planner']['warning'])

    @patch('backend.planning.ask_ollama')
    def test_invalid_ai_coordinates_fallback_still_honors_count(self, ask):
        ask.return_value = {'monitor_temperature': True, 'detect_leaks': True,
            'requirements': self.layout['requirements'],
            'gateways': [{'x': -1, 'y': 0}, {'x': -2, 'y': 0}], 'reasoning': 'Invalid'}
        result = self.post('2 rooms, 2 gateways')
        self.assertEqual(len(result['layout']['gateways']), 2)
        self.assertEqual(result['planner']['source'], 'deterministic_fallback')
        self.assertIn('Rejected AI placement', result['planner']['warning'])

    @patch('backend.planning.ask_ollama', side_effect=OSError('Forced fallback'))
    def test_monitoring_only_preserves_custom_rooms_walls_and_reception(self, _):
        self.layout['rooms'][0]['name'] = 'Custom room'
        result = self.post('Monitor temperature in all five rooms and bathroom leaks')
        self.assertEqual(result['design_request']['mode'], 'existing_layout')
        for key in ('rooms', 'walls', 'reception', 'floor'):
            self.assertEqual(result['layout'][key], self.layout[key])

    @patch('backend.planning.ask_ollama')
    def test_unsupported_counts_return_structured_error_without_ai(self, ask):
        for prompt in ('3 gateways', '33 rooms', '2 rooms, 3 rooms', '1.5 rooms'):
            response = self.client.post('/api/design', json={'layout': self.layout, 'prompt': prompt})
            self.assertEqual(response.status_code, 422, response.text)
            OUTPUT_VALIDATOR.validate(response.json())
            self.assertEqual(response.json()['status'], 'error')
        ask.assert_not_called()


if __name__ == '__main__': unittest.main()
