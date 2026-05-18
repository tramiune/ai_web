import { onRequestPost as onCassoRequestPost } from './functions/api/casso-webhook.js';
import { onRequestPost as onLemonSqueezyRequestPost } from './functions/api/lemonsqueezy-webhook.js';

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    
    // Nếu khách gọi vào link webhook Casso
    if (url.pathname === '/api/casso-webhook') {
      return onCassoRequestPost({ request, env, context });
    }

    // Nếu khách gọi vào link webhook Lemon Squeezy
    if (url.pathname === '/api/lemonsqueezy-webhook') {
      return onLemonSqueezyRequestPost({ request, env, context });
    }

    // Nếu không phải link API, thì trả về lỗi 404 (để Cloudflare Assets tự xử lý phần web tĩnh)
    return new Response("Not Found", { status: 404 });
  }
};
