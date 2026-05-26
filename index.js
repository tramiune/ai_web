import { onRequestPost as onCassoRequestPost } from './functions/api/casso-webhook.js';
import {
  onConfigRequest as onPaypalConfigRequest,
  onCreateOrderRequest as onPaypalCreateOrderRequest,
  onCaptureOrderRequest as onPaypalCaptureOrderRequest,
  onWebhookRequest as onPaypalWebhookRequest
} from './functions/api/paypal.js';

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const method = request.method;

    // --- Casso (VietQR) webhook ----------------------------------------------
    if (url.pathname === '/api/casso-webhook' && method === 'POST') {
      return onCassoRequestPost({ request, env, context });
    }

    // --- PayPal (International) ----------------------------------------------
    // Public config (GET): returns clientId + env for the JS SDK on the frontend.
    if (url.pathname === '/api/paypal-config' && method === 'GET') {
      return onPaypalConfigRequest({ request, env, context });
    }
    // Smart Buttons createOrder callback target.
    if (url.pathname === '/api/paypal-create-order' && method === 'POST') {
      return onPaypalCreateOrderRequest({ request, env, context });
    }
    // Smart Buttons onApprove callback target.
    if (url.pathname === '/api/paypal-capture-order' && method === 'POST') {
      return onPaypalCaptureOrderRequest({ request, env, context });
    }
    // Server-to-server webhook from PayPal (PAYMENT.CAPTURE.COMPLETED etc.).
    if (url.pathname === '/api/paypal-webhook' && method === 'POST') {
      return onPaypalWebhookRequest({ request, env, context });
    }

    // Geo hint for auto language: tier mapping via lang-config.js on frontend.
    if (url.pathname === '/api/geo' && method === 'GET') {
      const country = request.headers.get('CF-IPCountry')
        || request.headers.get('cf-ipcountry')
        || 'XX';
      const tierLangMap = {
        VN: 'vi',
        ES: 'es', MX: 'es', CO: 'es', AR: 'es', CL: 'es', PE: 'es', EC: 'es',
        VE: 'es', UY: 'es', PY: 'es', BO: 'es', CR: 'es', PA: 'es', DO: 'es',
        GT: 'es', HN: 'es', NI: 'es', SV: 'es', PR: 'es', CU: 'es',
        BR: 'pt', PT: 'pt',
        TH: 'th', ID: 'id'
      };
      const lang = tierLangMap[country] || 'en';
      return new Response(JSON.stringify({ country, lang }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Proxy R2 template API to avoid CORS issues.
    if (url.pathname === '/api/templates' && method === 'GET') {
      const r2Url = 'https://pub-4496e76c4ba34c28980998855e485fbd.r2.dev/api/template.json';
      const r2Res = await fetch(r2Url);
      return new Response(r2Res.body, {
        status: r2Res.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    // Not an API route - let Cloudflare Assets serve static files.
    return new Response('Not Found', { status: 404 });
  }
};
