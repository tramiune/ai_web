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
  "private_key_id": "a66df98cff206819acb3cd55f0297e57527d2e53",
  "private_key": "-----BEGIN PRIVATE KEY-----\nDUMMY_KEY_FOR_GITHUB_PUSH_PROTECTION\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@motionai-studio-76be9.iam.gserviceaccount.com",
  "client_id": "100366378819877121287",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40motionai-studio-76be9.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
      const body = await request.json();
      if (!body.data || !Array.isArray(body.data)) return new Response("No data", { status: 400 });

      // Lấy thông tin Service Account từ Environment Variable (nếu có), nếu không thì dùng bản hardcoded
      let config = SERVICE_ACCOUNT;
      const envSecret = env ? (env.FIREBASE_SERVICE_ACCOUNT || env.SERVICE_ACCOUNT) : null;
      if (envSecret) {
        try {
          config = JSON.parse(envSecret);
        } catch (e) {
          console.error("Lỗi parse SERVICE_ACCOUNT từ ENV:", e);
        }
      }

      // Lấy Token
      const accessToken = await getAccessToken(config.client_email, config.private_key);

      // Lấy danh sách các đơn nạp đang chờ (tối đa 50 đơn gần nhất) để đối soát linh hoạt
      const pendingTopups = await fetchPendingTopups(accessToken, config.project_id);

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
           const tidDisplay = transaction.tid || transaction.id || 'N/A';
           const message = `💰 *NẠP TIỀN THÀNH CÔNG!*\n\n` +
                           `👤 Khách: ${topup.userName || 'N/A'}\n` +
                           `📧 Email: ${topup.userEmail || 'N/A'}\n` +
                           `💵 Số tiền: ${amount.toLocaleString()}đ\n` +
                           `🪙 Coin nhận: +${coins}\n` +
                           `📝 Nội dung: ${code}\n` +
                           `🔑 Mã GD: \`${tidDisplay}\``;
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

async function fetchPendingTopups(token, projectId) {
  const PROJECT_ID = projectId || "motionai-studio-76be9";
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
