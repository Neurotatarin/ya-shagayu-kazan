import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

temporary = tempfile.TemporaryDirectory()
os.environ['KAZAN_STATE'] = temporary.name
import server


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.initialize()
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.base = 'http://127.0.0.1:' + str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()

    def request(self, path, body=None, token=None, method=None, origin=server.ORIGIN):
        headers = {'Content-Type': 'application/json', 'Origin': origin}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = Request(self.base + '/api/' + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
        try:
            with urlopen(request) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def guest(self):
        return self.request('guest', {})[1]['token']

    def test_catalog_and_access_control(self):
        status, data = self.request('catalog')
        self.assertEqual(status, 200)
        self.assertEqual(len(data['places']), 20)
        self.assertGreater(next(p for p in data['places'] if p['id'] == 'kremlin')['coordinates'][1], 55.79)
        self.assertEqual(self.request('progress')[0], 401)
        self.assertEqual(self.request('guest', {}, origin='https://untrusted.example')[0], 403)

    def test_progress_is_isolated_and_validated(self):
        first, second = self.guest(), self.guest()
        progress = {'favorites': ['ushkova'], 'visited': ['kremlin'], 'positions': {'ushkova': 123}}
        self.assertEqual(self.request('progress', progress, first, 'PUT'), (200, progress))
        self.assertEqual(self.request('progress', token=first)[1], progress)
        self.assertEqual(self.request('progress', token=second)[1]['favorites'], [])
        self.assertEqual(self.request('progress', {**progress, 'favorites': ['invented-place']}, first, 'PUT')[0], 400)
        self.assertEqual(self.request('progress', {**progress, 'positions': {'ushkova': float('nan')}}, first, 'PUT')[0], 400)

    def test_real_route_contract_cache_and_no_straight_line_fallback(self):
        route = {'code': 'Ok', 'routes': [{'distance': 1678.3, 'duration': 1450.9, 'geometry': {'type': 'LineString', 'coordinates': [[49.105, 55.798], [49.107, 55.795], [49.121, 55.792]]}, 'legs': [{'distance': 1678.3, 'duration': 1450.9}]}], 'waypoints': [{'distance': 5}, {'distance': 8}]}
        token = self.guest()
        with patch.object(server, 'urlopen', return_value=io.BytesIO(json.dumps(route).encode())) as request:
            status, actual = self.request('walking-route', {'placeIds': ['kul-sharif', 'ushkova']}, token)
            self.assertEqual(status, 200)
            self.assertEqual(len(actual['geometry']['coordinates']), 3)
            self.assertIn('/routed-foot/', request.call_args.args[0].full_url)
            self.assertTrue(self.request('walking-route', {'placeIds': ['kul-sharif', 'ushkova']}, token)[1]['cached'])
            self.assertEqual(request.call_count, 1)
        self.assertEqual(self.request('walking-route', {'placeIds': ['ushkova'], 'start': [37.6, 55.7]}, token)[0], 400)
        self.assertEqual(self.request('walking-route', {'placeIds': ['invented-place', 'ushkova']}, token)[0], 400)
        with patch.object(server, 'urlopen', side_effect=URLError('offline')):
            self.assertEqual(self.request('walking-route', {'placeIds': ['petro', 'nmrt']}, token)[0], 503)

    def test_chat_validates_catalog_and_persists_context(self):
        answer = {'message': 'Начни с Кремля.', 'routeTitle': 'Кремль и дом Ушковой', 'placeIds': ['kremlin', 'ushkova']}
        response = {'output': [{'content': [{'type': 'output_text', 'text': json.dumps(answer)}]}], 'usage': {'input_tokens': 100, 'output_tokens': 100}, 'model': 'gpt-5.4-mini-2026-03-17'}
        token = self.guest()
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-only-not-a-real-key'}), patch.object(server, 'urlopen', return_value=io.BytesIO(json.dumps(response).encode())) as request, patch.object(server, 'walking_route', return_value={'distanceMeters': 1300, 'durationSeconds': 1080}):
            code, result = self.request('chat', {'message': 'Прогулка на час', 'conversationId': 'test-conversation-1234'}, token)
            self.assertEqual(code, 200)
            self.assertEqual(result['placeIds'], answer['placeIds'])
            sent = json.loads(request.call_args.args[0].data)
            self.assertFalse(sent['store'])
            self.assertEqual(sent['text']['format']['type'], 'json_schema')
            self.assertEqual(sent['max_output_tokens'], 900)
        with server.connect() as db:
            self.assertEqual(len(json.loads(db.execute('SELECT body FROM conversations').fetchone()[0])), 2)

    def test_ai_walk_is_checked_against_street_path_and_time_budget(self):
        self.assertEqual(server.route_constraints('У меня час, хочу 2–3 близких места.'), (3, 60))
        self.assertEqual(server.route_constraints('На 1 час 20 минут, до 4 остановок'), (4, 80))
        places = server.catalog()['places']
        answer = {'message': 'Успеешь за час!', 'routeTitle': 'Прогулка', 'placeIds': ['kremlin', 'ushkova', 'temple']}
        with patch.object(server, 'walking_route', side_effect=[{'distanceMeters': 14000, 'durationSeconds': 11000}, {'distanceMeters': 1300, 'durationSeconds': 1080}]) as router:
            result = server.checked_ai_route(answer, 'Час на Кремль и Дом Ушковой, 2–3 места', places)
        self.assertEqual(result['placeIds'], ['kremlin', 'ushkova'])
        self.assertEqual(router.call_count, 2)
        self.assertEqual(result['walkingSeconds'], 1080)
        self.assertTrue(result['fitsBudget'])
        self.assertNotIn('Успеешь', result['message'])
        self.assertIn('1,3 км', result['message'])

    def test_ai_does_not_promise_an_impossible_or_unchecked_walk(self):
        answer = {'message': 'Успеешь!', 'routeTitle': 'Прогулка', 'placeIds': ['kremlin', 'ushkova']}
        with patch.object(server, 'walking_route', return_value={'distanceMeters': 1300, 'durationSeconds': 1080}):
            result = server.checked_ai_route(answer, 'За 10 минут Кремль и Дом Ушковой', server.catalog()['places'])
        self.assertFalse(result['fitsBudget'])
        self.assertEqual(result['placeIds'], answer['placeIds'])
        self.assertIn('не помещается', result['message'])
        with patch.object(server, 'walking_route', side_effect=server.ApiError(503, 'offline')):
            result = server.checked_ai_route(answer, 'Прогулка на час', server.catalog()['places'])
        self.assertNotIn('walkingSeconds', result)
        self.assertIn('не подтверждены', result['message'])


if __name__ == '__main__':
    unittest.main()
