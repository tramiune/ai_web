/**
 * motionai-upload-api — upload/download R2 cho Motion AI (web + bot).
 * GET  ?file=characters/...  → stream từ R2 (Content-Length + Range)
 * POST ?file=motions/...     → ghi R2, trả { url }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

function normalizeKey(key) {
  if (!key || typeof key !== 'string') return '';
  let k = key.replace(/\\/g, '/').replace(/\.\.+/g, '_').replace(/^\/+/, '');
  if (k.includes('..') || k.startsWith('/')) return '';
  return k;
}

function badKey(key) {
  const k = normalizeKey(key);
  if (!k) return true;
  return false;
}

async function handleGet(request, env, key, url) {
  const object = await env.MY_R2_BUCKET.get(key);
  if (!object) {
    return new Response('File not found', { status: 404, headers: CORS });
  }

  const headers = new Headers(CORS);
  object.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=86400');
  if (object.size != null) {
    headers.set('Content-Length', String(object.size));
  }
  if (url.searchParams.get('download') === '1') {
    const name = key.split('/').pop() || 'download';
    headers.set('Content-Disposition', `attachment; filename="${name}"`);
  }

  const range = request.headers.get('Range');
  if (range && object.size != null) {
    const m = /^bytes=(\d+)-(\d*)$/i.exec(range.trim());
    if (m) {
      const start = parseInt(m[1], 10);
      let end = m[2] ? parseInt(m[2], 10) : object.size - 1;
      end = Math.min(end, object.size - 1);
      if (start <= end && start >= 0 && start < object.size) {
        const length = end - start + 1;
        const slice = await env.MY_R2_BUCKET.get(key, {
          range: { offset: start, length },
        });
        if (!slice) {
          return new Response('Range Not Satisfiable', { status: 416, headers: CORS });
        }
        headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
        headers.set('Content-Length', String(length));
        return new Response(request.method === 'HEAD' ? null : slice.body, { status: 206, headers });
      }
    }
  }

  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

async function handlePost(request, env, key, url) {
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  await env.MY_R2_BUCKET.put(key, request.body, {
    httpMetadata: { contentType },
  });
  const publicUrl = `${url.origin}/?file=${encodeURIComponent(key)}`;
  return Response.json({ ok: true, url: publicUrl, key }, { headers: CORS });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const rawKey = url.searchParams.get('file');
    const key = normalizeKey(rawKey);
    if (badKey(rawKey)) {
      return new Response('Missing or invalid file key', { status: 400, headers: CORS });
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      return handleGet(request, env, key, url);
    }
    if (request.method === 'POST') {
      return handlePost(request, env, key, url);
    }

    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};
