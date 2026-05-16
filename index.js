import { onRequestPost } from './functions/api/casso-webhook.js';

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    
    // Nếu khách gọi vào link webhook
    if (url.pathname === '/api/casso-webhook') {
      return onRequestPost({ request, env, context });
    }

    // Nếu không phải link API, thì trả về lỗi 404 (để Cloudflare Assets tự xử lý phần web tĩnh)
    return new Response("Not Found", { status: 404 });
  }
};
