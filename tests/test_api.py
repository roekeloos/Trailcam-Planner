import http.cookiejar
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


class PresetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.db = str(Path(cls.temp.name) / 'presets.sqlite3')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.origin = f'http://127.0.0.1:{cls.port}'
        cls.start()

    @classmethod
    def start(cls):
        cls.process = subprocess.Popen(['python3', str(ROOT / 'server.py')], env={**os.environ, 'PORT': str(cls.port), 'PUBLIC_ORIGIN': cls.origin, 'DATABASE_PATH': cls.db}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.origin).close()
                return
            except OSError:
                time.sleep(.05)
        raise RuntimeError('Server failed to start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait()
        cls.temp.cleanup()

    def test_presets_isolation_validation_and_restart(self):
        alice = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        bob = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def request(client, method='GET', path='/api/presets', data=None, origin=None):
            req = urllib.request.Request(self.origin + path, method=method, headers={'Origin': origin or self.origin, 'Content-Type': 'application/json'}, data=json.dumps(data).encode() if data is not None else None)
            with client.open(req) as response:
                return json.load(response)
        request(alice)
        request(bob)
        settings = json.loads((ROOT / 'settings-schema.json').read_text())
        settings.update(setup='hybrid', mode='both', linked=False, photoRate=3, videoRate=7, lapseUsesCaptureSettings=True, photo8=3.25)
        payload = {'name': '<img src=x onerror=alert(1)>', 'settings': settings}
        saved = request(alice, 'POST', data=payload)['preset']
        self.assertEqual(request(alice)['presets'][0]['settings'], settings)
        self.assertEqual(request(bob)['presets'], [])
        with self.assertRaises(urllib.error.HTTPError) as error:
            request(bob, 'DELETE', '/api/presets/' + saved['id'])
        self.assertEqual(error.exception.code, 404)
        error.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as error:
            request(alice, 'POST', data=payload, origin='https://other.example')
        self.assertEqual(error.exception.code, 403)
        error.exception.close()
        for field, value in [('hours', 25), ('capacity', -1), ('linked', 'yes'), ('setup', 'unknown'), ('interval', 0)]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                request(alice, 'POST', data={'name': 'Invalid', 'settings': {**settings, field: value}})
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
        self.process.terminate()
        self.process.wait()
        self.start()
        self.assertEqual(request(alice)['presets'][0], saved)
        backup_path = str(Path(self.temp.name) / 'backup.sqlite3')
        with sqlite3.connect(self.db) as source, sqlite3.connect(backup_path) as backup:
            source.backup(backup)
            self.assertEqual(backup.execute('SELECT count(*) FROM presets').fetchone()[0], 1)
        request(alice, 'DELETE', '/api/presets/' + saved['id'])
        self.assertEqual(request(alice)['presets'], [])
        for path, mime in [('/', 'text/html'), ('/app.mjs', 'text/javascript'), ('/calculate.mjs', 'text/javascript')]:
            with urllib.request.urlopen(self.origin + path) as response:
                self.assertTrue(response.headers['Content-Type'].startswith(mime))
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.origin + '/server.py')
        error.exception.close()


if __name__ == '__main__':
    unittest.main()
