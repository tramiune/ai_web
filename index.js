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

    // Geo hint for auto language: VN → vi, everything else → en.
    if (url.pathname === '/api/geo' && method === 'GET') {
      const country = request.headers.get('CF-IPCountry')
        || request.headers.get('cf-ipcountry')
        || 'XX';
      return new Response(JSON.stringify({ country }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Not an API route - let Cloudflare Assets serve static files.
    return new Response('Not Found', { status: 404 });
  }
};
