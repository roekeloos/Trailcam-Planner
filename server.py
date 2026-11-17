"""Small same-origin preset API and static server; Caddy provides public HTTPS."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
import socketserver
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).parent / 'dist'
DB = Path(os.environ.get('DATABASE_PATH', 'data/presets.sqlite3'))
ORIGIN = os.environ.get('PUBLIC_ORIGIN', 'http://127.0.0.1:8080')
COOKIE = '__Host-trailcam' if ORIGIN.startswith('https://') else 'trailcam'
DEFAULTS = json.loads((Path(__file__).parent / 'settings-schema.json').read_text())


def connect():
    return sqlite3.connect(DB, timeout=10)


def validate(settings):
    if not isinstance(settings, dict) or settings.keys() != DEFAULTS.keys():
        raise ValueError('Save a complete set of calculator settings.')
    enums = {'setup': ['motion', 'lapse', 'hybrid'], 'mode': ['photo', 'video', 'both'],
             'photoRes': ['2', '4', '8', '16', '32'], 'videoRes': ['SD', 'HD', 'QHD', '4K'],
             'unit': ['seconds', 'minutes']}
    for key, default in DEFAULTS.items():
        value = settings[key]
        if key in enums:
            if value not in enums[key]:
                raise ValueError('Invalid ' + key)
        elif isinstance(default, bool):
            if type(value) is not bool:
                raise ValueError('Invalid ' + key)
        elif key == 'deployment' and value == '':
            continue
        elif type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1_000_000_000:
            raise ValueError('Invalid ' + key)
        elif key in ('hours', 'lapseHours') and value > 24:
            raise ValueError('Hours cannot exceed 24.')
        elif key == 'burst' and value not in (1, 3, 5):
            raise ValueError('Invalid burst.')
        elif key in ('capacity', 'interval', 'videoSeconds') or key.startswith(('photo', 'video')) and key not in ('photoRate', 'videoRate'):
            if value <= 0:
                raise ValueError(key + ' must be positive.')
    if settings['reserved'] > settings['capacity']:
        raise ValueError('Reserved space exceeds card capacity.')
    return settings


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def reply(self, status, data, cookie=None):
        body = json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        if cookie:
            secure = '; Secure' if ORIGIN.startswith('https://') else ''
            self.send_header('Set-Cookie', f'{COOKIE}={cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000{secure}')
        self.end_headers()
        self.wfile.write(body)

    def owner(self):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get('Cookie', ''))
            token = cookies[COOKIE].value if COOKIE in cookies else ''
        except Exception:
            token = ''
        if re.fullmatch(r'[0-9a-f]{64}', token):
            return hashlib.sha256(token.encode()).hexdigest(), None
        token = secrets.token_hex(32)
        return hashlib.sha256(token.encode()).hexdigest(), token

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/presets':
            owner, cookie = self.owner()
            with connect() as db:
                rows = db.execute('SELECT id,name,settings FROM presets WHERE owner=? ORDER BY created,id', (owner,)).fetchall()
            self.reply(200, {'presets': [{'id': r[0], 'name': r[1], 'settings': json.loads(r[2])} for r in rows]}, cookie)
            return
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/style.css': ('style.css', 'text/css'),
                 '/app.mjs': ('app.mjs', 'text/javascript'), '/calculate.mjs': ('calculate.mjs', 'text/javascript')}
        if path not in files:
            self.reply(404, {'error': 'Not found'})
            return
        name, mime = files[path]
        body = (ROOT / name).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != '/api/presets':
            self.reply(404, {'error': 'Not found'})
            return
        owner, new_cookie = self.owner()
        if self.headers.get('Origin') != ORIGIN or new_cookie:
            self.reply(403, {'error': 'Reload the page before saving.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 16384:
                raise ValueError('Invalid request size.')
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Invalid preset.')
            name = data.get('name')
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
                raise ValueError('Use a name between 1 and 80 characters.')
            settings = validate(data.get('settings'))
            identifier = secrets.token_hex(16)
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                if db.execute('SELECT count(*) FROM presets WHERE owner=?', (owner,)).fetchone()[0] >= 100:
                    self.reply(409, {'error': 'This browser has reached the 100 preset limit.'})
                    return
                if db.execute('SELECT count(*) FROM presets').fetchone()[0] >= 10000:
                    self.reply(503, {'error': 'Preset storage is full.'})
                    return
                db.execute('INSERT INTO presets(id,owner,name,settings) VALUES(?,?,?,?)',
                           (identifier, owner, name.strip(), json.dumps(settings, allow_nan=False)))
            self.reply(201, {'preset': {'id': identifier, 'name': name.strip(), 'settings': settings}})
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.reply(400, {'error': str(error)})

    def do_DELETE(self):
        match = re.fullmatch(r'/api/presets/([0-9a-f]{32})', self.path)
        owner, new_cookie = self.owner()
        if self.headers.get('Origin') != ORIGIN or new_cookie:
            self.reply(403, {'error': 'Reload the page before deleting.'})
        elif not match:
            self.reply(404, {'error': 'Not found'})
        else:
            with connect() as db:
                result = db.execute('DELETE FROM presets WHERE id=? AND owner=?', (match[1], owner))
            self.reply(200 if result.rowcount else 404, {'deleted': bool(result.rowcount)})


class Server(ThreadingHTTPServer):
    def server_bind(self):
        socketserver.TCPServer.server_bind(self)
        self.server_name = 'trailcam'
        self.server_port = self.server_address[1]


if __name__ == '__main__':
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS presets (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, settings TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP)')
        db.execute('CREATE INDEX IF NOT EXISTS presets_owner ON presets(owner)')
    Server(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler).serve_forever()
