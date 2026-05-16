/**
 * Casso Webhook Handler (Production Ready - Hardcoded Credentials)
 * MotionAI Studio - Automated Top-up
 */

const TELEGRAM_BOT_TOKEN = '8676046240:AAE14lDxAj9otGTjVnd8Smr2__Wg-J2dCLc';
const TELEGRAM_CHAT_ID = '6067707939';

// Dán toàn bộ nội dung file JSON của bạn vào đây
const SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "motionai-studio-76be9",
  "private_key_id": "2a17daf279ad84846382cb51aeeee541fe71392e",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDJSV9Og0yRIdnm\n97b/DmUD74CJTSIwYuXcgxyDTLbvexuYzUv9Io158JKm/OHPy+p2iL3U0vpc05Y+\nnaupdKH8qWzhMXXCICDpUuzYzy/p8Pn78qqjI+EVLjrqiwAqlvPO2u57bvAbykoE\njLgQK3IY3vnI+c9Ns2iAUNy9/JqEme5mWL5wrzd6EZyUXdJuhygrtSA5dC68Wj/U\nCVZfcoS93PH4umAs74ec8v7+xp8x5JWinZm2j2cWlDiJ79C8qH/zqOQ51wbWerTh\nG9phgaoVdPQaayV+KFrabla9pc8CKF+lRIaQN3eqjAKpVTqDvsEcr4psD3PTTSKt\nmumtovbvAgMBAAECggEAK7et5YWK6bKqewmuSzM7KWGpTyjblhrExeIMHVBaIyVf\n1w4vxOjuRV/E2lPuT42AfQIyCLlR+ztRVIQ2NnXIgPHjXf26D9GelE6YdnZ5d5wJ\nD3mjKg+u4UTLMwnBnX5vsavHRDPSHpcPAHH3wDtPaqtzIP1w0vV2avglGXZ1sPrC\nsWTskO/GVSHF1KxGeKXgq8R3v3rEXlmbJr1UL2HLCOdC2I/smO1MJq9aYIDmb14Q\nyH1jp05Kj/990cl82xINnTdywL8IGntP/qqQFPji43ySGGroqCIE4pDAE+mEAPGg\nDmZgiO5BmWmv6NsxTt76BMhDmW8QoKde+0nKfhVK8QKBgQD8A8ICEiweNZ9yqmNS\nESdYIq5GA9gy9QWnG/lJ1jA/qJ2ZKPwolDmej0Qab1MePUsvpsolifW4/D0OGnfg\nJH8dMdpDYR3OR8TnohNyDHqre23+ptMwZE4hx72jN+ZS7VHaKp7o26qVrU5xi8D+\nwkU3heRRM8Q9bmiZssDoBFQHHQKBgQDMeD/wvovjecB9UiV3GpJBT9TmAjLYZlrv\nsFIJpVDm+O7+dR7Gvh8albIKAgeBGDNiVzkjlqQ4w0qmwu6O2nA8Giq2bNpMWY6D\ngfaf81CXk4a7hY+FZQ3SZ0x6B7c2iu9Spxkr6HDspHFgS1A19qI0KgPMPE996G+R\nBn32cN/8ewKBgEbGM2Trf5JYUtgb+9qfUKJS0wh8qendn+HHXGIdEd2+18uck/w9\nbFUYPPMDkp8qbYQLXjfen7B8vhTI4COFfGFRj89eZcV5qFW40ac00/p2pnRem266\nrKqV8q700u01EsinMYuJrUVtr1r5+ZBSNKgcJPudAx6RdDS926kNFiANAoGAFj0d\n9zlCTcN4RCkjGgkxzxi3tyyWCyNW0KsEwTfRzM1WcSab6lHTYDjX3G7MEiZnsFJ8\nTHqd8e6LuAeLms33VxIhgyXjuFolPfhssojsQxAwn0Svj3qmPjQuBTfBnZUO4pZ6\nDmSBo7te+XI3jyb8DWBkeVo16yPUvplOKfes5PECgYEAp99wKtxiJOHte6lUZaDD\nlFtijTldZOrXtuSiWyg3myz57eCd3n8R6HlttXPdZnIiS5/4f6sW2JhNWKDxA5UJ\ngox+105yUVtsGE1m/m+XlD2u2Ht0MWpXsTPMkhuxVH745X80KCfj5N0jEeRApec2\nXV8WDIhJzhE8w6PvEcr/8lY=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@motionai-studio-76be9.iam.gserviceaccount.com",
  "client_id": "100366378819877121287",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40motionai-studio-76be9.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

export async function onRequestPost(context) {
    const { request } = context;
    try {
      const body = await request.json();
      if (!body.data || !Array.isArray(body.data)) return new Response("No data", { status: 400 });

      // Lấy Token bằng thông tin hardcoded
      const accessToken = await getAccessToken(SERVICE_ACCOUNT.client_email, SERVICE_ACCOUNT.private_key);

      // Lấy danh sách các đơn nạp đang chờ (tối đa 50 đơn gần nhất) để đối soát linh hoạt
      const pendingTopups = await fetchPendingTopups(accessToken);

      for (const transaction of body.data) {
        const description = (transaction.description || "").toUpperCase();
        const amount = transaction.amount || 0;

        // Tìm đơn nạp khớp với nội dung chuyển khoản (chỉ cần nội dung chứa mã là được)
        const topup = pendingTopups.find(t => description.includes(t.transferContent.toUpperCase()));

        if (topup) {
           const coins = topup.coins;
           const code = topup.transferContent;

           // KIỂM TRA BẢO MẬT: Xác minh số tiền chuyển khoản thực tế có đủ không
           if (topup.amount && amount < topup.amount) {
               console.warn(`[CẢNH BÁO] Nạp thiếu tiền: Yêu cầu ${topup.amount}, nhận ${amount}`);
               const message = `⚠️ *CẢNH BÁO NẠP THIẾU TIỀN!*\n\n` +
                               `👤 Khách: ${topup.userName || 'N/A'}\n` +
                               `💵 Số tiền nhận: ${amount.toLocaleString()}đ\n` +
                               `📉 Yêu cầu: ${topup.amount.toLocaleString()}đ\n` +
                               `🪙 Đơn: ${coins} Coin\n` +
                               `📝 Nội dung: ${code}\n` +
                               `*Lưu ý:* Hệ thống KHÔNG cộng coin tự động cho giao dịch này.`;
               await notifyTelegram(message);
               continue; // Bỏ qua, không cộng coin
           }

           await grantCoins(accessToken, topup.userId, coins, topup.id);
           console.log(`Successfully granted ${coins} coins to user ${topup.userId}`);
           
           // Gửi thông báo Telegram
           const message = `💰 *NẠP TIỀN THÀNH CÔNG!*\n\n` +
                           `👤 Khách: ${topup.userName || 'N/A'}\n` +
                           `📧 Email: ${topup.userEmail || 'N/A'}\n` +
                           `💵 Số tiền: ${amount.toLocaleString()}đ\n` +
                           `🪙 Coin nhận: +${coins}\n` +
                           `📝 Nội dung: ${code}`;
           await notifyTelegram(message);
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      console.error("Critical Webhook Error:", err.message);
      // Gửi lỗi về Telegram để b biết chính xác chuyện gì đang xảy ra
      await notifyTelegram(`❌ *LỖI WEBHOOK CRITICAL!*\n\n` +
                           `📝 Thông báo: ${err.message}\n` +
                           `🔍 Hãy kiểm tra Logs trên Cloudflare để xem chi tiết.`);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}

// --- Helpers ---

async function getAccessToken(email, privateKey) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp, iat
  }));

  const message = `${header}.${payload}`;
  
  // Clean PEM Key - Siêu phòng thủ
  let pemContents = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "") // Xóa bỏ tất cả khoảng trắng, xuống dòng, tab...
    .replace(/\\n/g, ""); // Xóa bỏ ký tự \n nếu có
    
  while (pemContents.length % 4 !== 0) pemContents += "=";
    
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  
  const key = await crypto.subtle.importKey(
    "pkcs8", binaryDer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
  const jwt = `${message}.${b64(String.fromCharCode(...new Uint8Array(signature)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  
  const data = await res.json();
  if (data.error) throw new Error("Google Auth Error: " + (data.error_description || data.error));
  return data.access_token;
}

async function fetchPendingTopups(token) {
  const PROJECT_ID = "motionai-studio-76be9";
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "topups" }],
        where: {
          fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "pending" } }
        },
        limit: 50
      }
    })
  });
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  
  return data
    .filter(item => item.document)
    .map(item => {
      const doc = item.document;
      const fields = doc.fields;
      return {
        id: doc.name.split("/").pop(),
        userId: fields.userId.stringValue,
        status: fields.status.stringValue,
        transferContent: fields.transferContent.stringValue,
        coins: parseInt(fields.coins?.integerValue || 0),
        userName: fields.userName?.stringValue || 'Khách',
        userEmail: fields.userEmail?.stringValue || '',
        amount: parseInt(fields.amount?.integerValue || fields.amount?.doubleValue || fields.amount?.stringValue || 0)
      };
    });
}

async function grantCoins(token, userId, coins, topupId) {
  const PROJECT_ID = "motionai-studio-76be9";
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  
  const userRes = await fetch(`${baseUrl}/users/${userId}`, { headers: { "Authorization": `Bearer ${token}` } });
  const userData = await userRes.json();
  const current = parseInt(userData.fields.coins?.integerValue || 0);

  await fetch(`${baseUrl}/users/${userId}?updateMask.fieldPaths=coins`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ fields: { coins: { integerValue: current + coins } } })
  });

  await fetch(`${baseUrl}/topups/${topupId}?updateMask.fieldPaths=status`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ fields: { status: { stringValue: "approved" } } })
  });
}

function b64(str) { return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

async function notifyTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: "Markdown"
      })
    });
  } catch (err) {
    console.error("Telegram Notify Error:", err.message);
  }
}
