"""Interior Studio Blender worker: Cycles renders (and recipe builds) over HTTP for Cloud Run.

Holds no secrets. Callers send their Supabase access token; the worker checks it with Supabase
Auth, checks studio membership and reads the scene with the caller's own permissions (RLS), so it
can do nothing the signed-in designer couldn't do themselves.

POST /render  -> streams NDJSON progress lines, last line {"done": true, "image": <base64>, ...}
POST /recipe  -> builds a furniture recipe in Blender, returns a GLB
GET  /health
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '')
ORIGINS = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', 'https://interior-studio-two.vercel.app,http://localhost:5173').split(',') if o.strip()]
HERE = os.path.dirname(os.path.abspath(__file__))
MAX_PIXELS = 6144 * 3072
MAX_SAMPLES = 2048
EDIT_ROLES = {'owner', 'admin', 'designer'}
# One render at a time per instance (Cloud Run concurrency is 1 too): Cycles uses every core.
BUSY = threading.Semaphore(1)
SAMPLE_RE = re.compile(r'Sample (\d+)/(\d+)')


class Denied(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def supa(path, token, method='GET', body=None, raw=False):
    req = urllib.request.Request(SUPABASE_URL + path, method=method, data=body)
    req.add_header('apikey', ANON_KEY)
    req.add_header('Authorization', f'Bearer {token}')
    if body is not None and not raw:
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
        return data if raw else json.loads(data or b'null')


def authorise(token, org_id):
    if not token:
        raise Denied(401, 'Sign in first.')
    try:
        user = supa('/auth/v1/user', token)
    except urllib.error.HTTPError:
        raise Denied(401, 'Your session has expired. Reload the page and sign in again.')
    q = urllib.parse.urlencode({'select': 'role', 'org_id': f'eq.{org_id}', 'user_id': f"eq.{user['id']}"})
    rows = supa(f'/rest/v1/org_members?{q}', token)
    if not rows or rows[0].get('role') not in EDIT_ROLES:
        raise Denied(403, 'Designer access is needed for cloud renders.')
    return user['id']


def num(v, lo, hi):
    v = float(v)
    if not (lo <= v <= hi):
        raise Denied(400, f'Value {v} out of range.')
    return v


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.command, fmt % args))

    def cors(self):
        origin = self.headers.get('Origin', '')
        if origin in ORIGINS or re.match(r'^https://interior-studio-[a-z0-9-]+\.vercel\.app$', origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'authorization, content-type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Max-Age', '600')

    def reply(self, status, body, ctype='application/json'):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.cors()
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            return self.reply(200, {'ok': True, 'busy': BUSY._value == 0})
        self.reply(404, {'error': 'not_found'})

    def read_json(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > 2_000_000:
            raise Denied(413, 'Request too large.')
        return json.loads(self.rfile.read(n) or b'{}')

    def token(self):
        return (self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()

    def do_POST(self):
        try:
            body = self.read_json()
            if self.path == '/render':
                return self.render(body)
            if self.path == '/recipe':
                return self.recipe(body)
            self.reply(404, {'error': 'not_found'})
        except Denied as e:
            self.reply(e.status, {'error': 'denied', 'message': str(e)})
        except Exception as e:  # noqa: BLE001
            self.log_message('error: %s', e)
            self.reply(500, {'error': 'internal', 'message': str(e)})

    # ---- renders -------------------------------------------------------------------------------
    def render(self, body):
        token = self.token()
        org = str(body.get('orgId', ''))
        authorise(token, org)
        scene_path = str(body.get('scenePath', ''))
        if not scene_path.startswith(org + '/') or '..' in scene_path:
            raise Denied(403, 'Scene not in your studio.')
        w = int(num(body['width'], 16, 8192))
        h = int(num(body['height'], 16, 8192))
        if w * h > MAX_PIXELS:
            raise Denied(400, 'Image too large.')
        samples = int(num(body['samples'], 1, MAX_SAMPLES))
        if not BUSY.acquire(blocking=False):
            raise Denied(429, 'The render worker is busy. Try again in a moment.')
        work = tempfile.mkdtemp(prefix='render-')
        try:
            self.send_response(200)
            self.cors()
            self.send_header('Content-Type', 'application/x-ndjson')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Accel-Buffering', 'no')
            self.send_header('Transfer-Encoding', 'chunked')
            self.end_headers()
            self.stream({'stage': 'downloading', 'progress': 0})
            glb = os.path.join(work, 'scene.glb')
            with open(glb, 'wb') as f:
                f.write(supa('/storage/v1/object/render-jobs/' + urllib.parse.quote(scene_path), token, raw=True))
            fmt = 'jpeg' if body.get('format') == 'jpeg' else 'png'
            out = os.path.join(work, 'out.jpg' if fmt == 'jpeg' else 'out.png')
            job = {
                'glb': glb, 'width': w, 'height': h, 'samples': samples, 'format': fmt,
                'camera': body.get('camera'), 'panorama': body.get('panorama'), 'lighting': body['lighting'],
                'spec': body['spec'], 'rooms': body.get('rooms', []), 'fixtures': body.get('fixtures', []),
            }
            with open(os.path.join(work, 'job.json'), 'w') as f:
                json.dump(job, f)
            proc = subprocess.Popen([sys.executable, os.path.join(HERE, 'render_scene.py'), os.path.join(work, 'job.json'), out],
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, cwd=work)
            tail = []
            last = -1.0
            for line in proc.stdout:
                tail = (tail + [line.strip()])[-15:]
                m = SAMPLE_RE.search(line)
                if m and int(m.group(2)):
                    frac = int(m.group(1)) / int(m.group(2))
                    if frac - last >= 0.01 or frac >= 1:
                        last = frac
                        self.stream({'stage': 'rendering', 'progress': round(frac, 3)})
                elif line.startswith('{"stage": "preparing"'):
                    self.stream(json.loads(line))
                elif 'denoising' in line.lower() and 'Loading' not in line:
                    self.stream({'stage': 'denoising', 'progress': 1})
            code = proc.wait()
            if code != 0 or not os.path.exists(out):
                self.stream({'error': 'render_failed', 'message': 'Blender failed: ' + ' | '.join(tail[-4:])})
            else:
                with open(out, 'rb') as f:
                    data = f.read()
                self.stream({'done': True, 'mime': 'image/jpeg' if fmt == 'jpeg' else 'image/png', 'width': w, 'height': h, 'samples': samples,
                             'image': base64.b64encode(data).decode()})
            self.wfile.write(b'0\r\n\r\n')
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            self.log_message('client went away')
        except Exception as e:  # noqa: BLE001 - headers are sent: report on the stream
            self.log_message('render error: %s', e)
            try:
                msg = 'Could not read the scene.' if isinstance(e, urllib.error.HTTPError) else str(e)
                self.stream({'error': 'render_failed', 'message': msg})
                self.wfile.write(b'0\r\n\r\n')
                self.wfile.flush()
            except OSError:
                pass
        finally:
            shutil.rmtree(work, ignore_errors=True)
            BUSY.release()

    def stream(self, obj):
        data = (json.dumps(obj) + '\n').encode()
        self.wfile.write(b'%x\r\n%s\r\n' % (len(data), data))
        self.wfile.flush()

    # ---- recipes -------------------------------------------------------------------------------
    def recipe(self, body):
        authorise(self.token(), str(body.get('orgId', '')))
        work = tempfile.mkdtemp(prefix='recipe-')
        try:
            src = os.path.join(work, 'recipe.json')
            out = os.path.join(work, 'model.glb')
            with open(src, 'w') as f:
                json.dump({'recipe': body['recipe'], 'materials': body.get('materials', {})}, f)
            r = subprocess.run([sys.executable, os.path.join(HERE, 'build_recipe.py'), src, out], capture_output=True, text=True, timeout=300, cwd=work)
            if r.returncode != 0 or not os.path.exists(out):
                raise Denied(422, 'Blender could not build this recipe: ' + (r.stdout + r.stderr)[-400:])
            with open(out, 'rb') as f:
                self.reply(200, f.read(), 'model/gltf-binary')
        finally:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8080'))
    print(f'Blender worker on :{port}', flush=True)
    ThreadingHTTPServer(('', port), Handler).serve_forever()
