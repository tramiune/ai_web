/**
 * Lemon Squeezy Webhook Handler (Cloudflare Workers / Firebase Admin API)
 * MotionAI Studio - Automated International Payments Top-up
 */

const TELEGRAM_BOT_TOKEN = '8676046240:AAE14lDxAj9otGTjVnd8Smr2__Wg-J2dCLc';
const TELEGRAM_CHAT_ID = '6067707939';

// Dùng chung cấu hình Service Account với Casso Webhook
const SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "motionai-studio-76be9",
  "private_key_id": "c938d9509d956fdab6bcdc71dffebe303681fcc8",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDcsY0c4llaOH1M\n0uegrOyefDgMnLaYbqD+N01hikI0iBZ28r4ibNe20c9D7Tyl0rropGp1DfLm5tp/\nv4Ih2b2YWudKr9Lg5Gw003HjGbsmCiab4j/fwSAYY08POXkV/GoFdOmTjxDzaVM7\nUohOW+0m81kL05zTD++4JcKJDojecZMi+chN9NXkVx27jYLUgd3x5MSUZZjKTZJo\nVg3+ZLJG3/ybf1I5KRgIGb2P9sWP58oWUoRjlYW4Isvjk6mJK+n04c62ECSu6bIO\nBEUNHTrG31XtFLey9q0f78sVp/pNKD3KJKSB0QhrfwWCYuzxk6kN7JEo4YiaWUIY\nO980N3SPAgMBAAECggEAGbYOZcg8YbBFb3RTa5rfLEL2OAialfKu4JRqeEvRFRP/\nuKw6GNehCq8HMczgl8RlEHfLNpzr6MO0vqpTNloK5nDnaQJH6U8jXhoo4VeHlVHH\nGA/JTOpP22zXx+3JshUzTYnGhpw7J33kplDMtC2t2NpZTEaYitcHS2cMHXHrNy2W\nW7ZVLAQYqm75JxG4Sx1b8wXuLgQJLuXahgJkN1yivYoIHRIEji215OrnqcXwA4MZ\n0iX2Qc485T9llnzVNtXe2DSwHhYjgpwm+RNqkGLSur4QKP15bHZM5zNsBZwgTdGX\nMHtyso5DePlpT0DD+YkxfIICRjf7luYYsBDtTKFSOQKBgQD8TzvG9Yiktfpfv90L\n+2WVn2w+VRGXrEU9ZnB6EjnbcYWXRKvO9XhovTRuMiOOhvY4YXT3CcOCrF3K6i0D\nFbbI4eGJNwo43ziJcqCbZJ3XH0jMefuFvnKUMJkdEmtsTjlus0tZ12EAEW1kWrtw\nitZxcfrLnSIzKI2pciyhb7nsdwKBgQDf6+6/zRhDRN9UUJyNdqFoUvG5pMY25nCr\n61nxrZWv81o9ZxJ+LZ0RWu3rL9YpWHiBxCl3ErBJPVOuW11IghLITEGl3FZMWZMq\nAe+i5FbwLDmMHQZZXuVuY6gjAAS0J1x7dEMCJGxayrVDoZjQny9temBbmmnQKjRa\n3azBEMD2qQKBgAKWTWac3enSc97HeNzGlyQRnmqFNMj5Wzxl8IFP7ofxgg0rBxf4\nLGPmjMMUgIjVmXC6jxh5YSfV3KBYBl4hut4UctuVVOWAZHQEWOE/Bt9N0tFF7u5Q\nJZyfYvKJXdCefLhF3l/tdXEqvJRq2cEtq0U+hfPQiKk9oTY7lXmSS7XBAoGASeE3\nIbNSmQdFRDVgodANSzVqqdyyxXRcomyBfZrPM4FwOagjUtxL4WkF7L4YxAV7pR0K\nrU3OOivwyys76Ot5tPpsAoRjOMepJYgD/9Ok15NP3WnKKXyE6FobJIkiBCqkedsP\nLMrFsWMGUW0k1VhgNpfU6QRWeychpQVUtVKIyBkCgYBPdzdVNfFcdF+tWTPbrjcY\nPYA+HYjSi4G8HBcRg1+b49Ykv1YkQPCovhR7ee3gR1Dt71LwSYtubszdVXPvKs+4\nvYvzBdpSmQ0nogZMnSkxkg62xn4J7zQwxfqJnKVj3KBbqA69PKeYkFNFQ0uTjvMP\nbC7uzH4P9b1nYAy0/ZlWmg==\n-----END PRIVATE KEY-----\n",
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
    
    // Sao lưu body text để xác thực chữ ký HMAC
    const bodyText = await request.text();
    
    try {
        const signature = request.headers.get("X-Signature");
        if (!signature) {
            console.error("Thiếu header X-Signature");
            return new Response("Missing signature", { status: 400 });
        }

        // Đọc Webhook Secret từ Environment Variable
        const secret = env.LEMONSQUEEZY_WEBHOOK_SECRET || "MY_SUPER_SECRET_LEMON_SIGNATURE";
        
        // Xác thực chữ ký
        const isVerified = await verifySignature(secret, bodyText, signature);
        if (!isVerified) {
            console.error("Chữ ký webhook Lemon Squeezy không hợp lệ!");
            return new Response("Invalid signature", { status: 401 });
        }

        const payload = JSON.parse(bodyText);
        const eventName = payload.meta ? payload.meta.event_name : "";

        // Chúng ta chỉ quan tâm đến sự kiện thanh toán thành công (order_created)
        if (eventName !== "order_created") {
            return new Response(JSON.stringify({ success: true, message: `Ignored event: ${eventName}` }), { status: 200 });
        }

        const data = payload.data;
        const attributes = data.attributes;
        const customData = payload.meta.custom_data || {};

        // Lấy thông tin khách hàng và gói nạp từ custom data truyền từ checkout link
        const userId = customData.user_id;
        const packageId = customData.package_id;
        const totalUsd = (attributes.total_usd || 0) / 100; // Số tiền dạng Cent đổi ra USD

        if (!userId) {
            console.error("Không tìm thấy user_id trong custom data của webhook!");
            return new Response("Missing user_id in custom_data", { status: 400 });
        }

        // Quy đổi số coin dựa trên gói nạp
        let coins = 0;
        let packageName = "Gói Nạp Quốc Tế";
        
        // Định nghĩa ánh xạ gói nạp quốc tế
        if (packageId === "starter_v2") {
            coins = 20;
            packageName = "Starter (International)";
        } else if (packageId === "creator") {
            coins = 100;
            packageName = "Creator (International)";
        } else if (packageId === "studio") {
            coins = 550;
            packageName = "Studio (International)";
        } else if (packageId === "pro-studio") {
            coins = 1100;
            packageName = "Enterprise (International)";
        } else {
            // Trường hợp khách thanh toán gói tùy chỉnh hoặc lỗi map id, tự động dò từ số tiền
            if (totalUsd >= 45) { coins = 1100; packageName = "Enterprise (Fallback)"; }
            else if (totalUsd >= 20) { coins = 550; packageName = "Studio (Fallback)"; }
            else if (totalUsd >= 4) { coins = 100; packageName = "Creator (Fallback)"; }
            else { coins = 20; packageName = "Starter (Fallback)"; }
        }

        // Xác thực Service Account từ ENV hoặc Hardcoded
        let config = SERVICE_ACCOUNT;
        const envSecret = env ? (env.FIREBASE_SERVICE_ACCOUNT || env.SERVICE_ACCOUNT) : null;
        if (envSecret) {
            try {
                config = JSON.parse(envSecret);
            } catch (e) {
                console.error("Lỗi parse SERVICE_ACCOUNT từ ENV:", e);
            }
        }

        // Lấy access token Firebase
        const accessToken = await getAccessToken(config.client_email, config.private_key);

        // Tạo bản ghi topup thành công trực tiếp vào Firestore
        const topupId = "lemon_" + data.id; // Dùng Order ID của Lemon làm ID bản ghi
        await createTopupRecord(accessToken, config.project_id, topupId, {
            userId: userId,
            userEmail: attributes.user_email || "",
            userName: attributes.user_name || "Khách Quốc Tế",
            packageName: packageName,
            coins: coins,
            amount: totalUsd,
            currency: "USD",
            transferContent: `LEMON ORDER #${attributes.order_number}`,
            status: "approved",
            isAutomated: true,
            gateway: "lemonsqueezy"
        });

        // Thực hiện cộng coin vào tài khoản người dùng
        await grantCoins(accessToken, config.project_id, userId, coins);

        // Gửi thông báo Telegram
        const message = `🌎 <b>NẠP TIỀN QUỐC TẾ THÀNH CÔNG!</b>\n\n` +
                        `👤 Khách: ${attributes.user_name || 'N/A'}\n` +
                        `📧 Email: ${attributes.user_email || 'N/A'}\n` +
                        `💵 Số tiền: $${totalUsd.toFixed(2)} USD\n` +
                        `🪙 Coin nhận: +${coins}\n` +
                        `📝 Hóa đơn: #${attributes.order_number} (Lemon Squeezy)`;
        await notifyTelegram(message);

        // Affiliate / Referral commission - isolated, must never block topup flow
        try {
            await payReferralCommission(accessToken, config.project_id, {
                topupId: topupId,
                referredUserId: userId,
                referredUserEmail: attributes.user_email || '',
                referredUserName: attributes.user_name || '',
                baseCoins: coins,
                gateway: 'lemonsqueezy'
            });
        } catch (refErr) {
            console.error('[Referral] Lemon Squeezy commission error (non-blocking):', refErr.message);
            try {
                await notifyTelegram(`⚠️ <b>LỖI TRẢ HOA HỒNG GIỚI THIỆU (LEMON)</b>\nTopup: ${topupId}\nLỗi: ${refErr.message}`);
            } catch (e) { /* swallow */ }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });

    } catch (err) {
        console.error("Critical Lemon Squeezy Webhook Error:", err.message);
        await notifyTelegram(`❌ <b>LỖI WEBHOOK LEMON SQUEEZY!</b>\n\n` +
                             `📝 Thông báo: ${err.message}`);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}

// --- Helpers ---

async function verifySignature(secret, payload, signature) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  
  // Convert hex signature to Uint8Array
  const sigBytes = new Uint8Array(signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const dataBytes = encoder.encode(payload);
  
  return await crypto.subtle.verify("HMAC", key, sigBytes, dataBytes);
}

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
  
  let pemContents = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "")
    .replace(/\\n/g, "");
    
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

async function createTopupRecord(token, projectId, topupId, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/topups/${topupId}`;
  
  const fields = {
    userId: { stringValue: data.userId },
    userEmail: { stringValue: data.userEmail },
    userName: { stringValue: data.userName },
    packageName: { stringValue: data.packageName },
    coins: { integerValue: data.coins },
    amount: { doubleValue: data.amount },
    transferContent: { stringValue: data.transferContent },
    status: { stringValue: data.status },
    isAutomated: { booleanValue: data.isAutomated },
    gateway: { stringValue: data.gateway },
    createdAt: { timestampValue: new Date().toISOString() }
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers: { 
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create topup record: ${errText}`);
  }
}

async function grantCoins(token, projectId, userId, coins) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  
  const userRes = await fetch(`${baseUrl}/users/${userId}`, { headers: { "Authorization": `Bearer ${token}` } });
  const userData = await userRes.json();
  const current = parseInt(userData.fields.coins?.integerValue || 0);

  const res = await fetch(`${baseUrl}/users/${userId}?updateMask.fieldPaths=coins`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ fields: { coins: { integerValue: current + coins } } })
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to grant coins: ${errText}`);
  }
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
        parse_mode: "HTML"
      })
    });
  } catch (err) {
    console.error("Telegram Notify Error:", err.message);
  }
}

// --- Affiliate / Referral Commission (mirrors casso-webhook.js) ---
const REFERRAL_COMMISSION_RATE = 0.10;

/**
 * Pay 10% referral commission in coins to the referrer of `referredUserId`.
 * Idempotent via doc ID = topupId on referralEarnings collection.
 */
async function payReferralCommission(token, projectId, params) {
  const { topupId, referredUserId, referredUserEmail, referredUserName, baseCoins, gateway } = params;
  if (!topupId || !referredUserId || !baseCoins || baseCoins <= 0) return;

  const commissionCoins = Math.floor(baseCoins * REFERRAL_COMMISSION_RATE);
  if (commissionCoins <= 0) return;

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const authHeader = { "Authorization": `Bearer ${token}` };

  const referredUserRes = await fetch(`${baseUrl}/users/${referredUserId}`, { headers: authHeader });
  if (!referredUserRes.ok) {
    if (referredUserRes.status === 404) return;
    throw new Error(`Read referred user failed: ${referredUserRes.status}`);
  }
  const referredUserData = await referredUserRes.json();
  const referredBy = referredUserData.fields?.referredBy?.stringValue;
  if (!referredBy) return;
  if (referredBy === referredUserId) return;

  const earningsBody = {
    fields: {
      referrerId: { stringValue: referredBy },
      referredUserId: { stringValue: referredUserId },
      referredUserEmail: { stringValue: referredUserEmail || referredUserData.fields?.email?.stringValue || '' },
      referredUserName: { stringValue: referredUserName || referredUserData.fields?.displayName?.stringValue || '' },
      topupId: { stringValue: topupId },
      baseCoins: { integerValue: baseCoins },
      commissionCoins: { integerValue: commissionCoins },
      commissionRate: { doubleValue: REFERRAL_COMMISSION_RATE },
      gateway: { stringValue: gateway || 'unknown' },
      payoutStatus: { stringValue: 'credited' },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  };

  const createUrl = `${baseUrl}/referralEarnings?documentId=${encodeURIComponent(topupId)}`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(earningsBody)
  });

  if (createRes.status === 409) {
    console.log(`[Referral] Commission already paid for topup ${topupId} - skipped (idempotent).`);
    return;
  }
  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`Create referralEarnings failed (${createRes.status}): ${txt}`);
  }

  const referrerRes = await fetch(`${baseUrl}/users/${referredBy}`, { headers: authHeader });
  if (!referrerRes.ok) throw new Error(`Read referrer failed: ${referrerRes.status}`);
  const referrerData = await referrerRes.json();
  const currentCoins = parseInt(referrerData.fields?.coins?.integerValue || 0);

  const patchRes = await fetch(`${baseUrl}/users/${referredBy}?updateMask.fieldPaths=coins&updateMask.fieldPaths=updatedAt`, {
    method: "PATCH",
    headers: { ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        coins: { integerValue: currentCoins + commissionCoins },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    })
  });
  if (!patchRes.ok) {
    const txt = await patchRes.text();
    throw new Error(`Credit referrer coins failed (${patchRes.status}): ${txt}`);
  }

  console.log(`[Referral] Paid ${commissionCoins} coin commission to ${referredBy} for topup ${topupId} (gateway=${gateway})`);

  try {
    const referrerName = referrerData.fields?.displayName?.stringValue || 'N/A';
    const referrerEmail = referrerData.fields?.email?.stringValue || '';
    await notifyTelegram(
      `🎁 <b>HOA HỒNG GIỚI THIỆU (${gateway})</b>\n\n` +
      `👤 Người giới thiệu: ${referrerName}\n` +
      `📧 Email: ${referrerEmail}\n` +
      `🪙 Hoa hồng: +${commissionCoins} Coin\n` +
      `🛒 Người được mời: ${referredUserName || 'N/A'} (nạp ${baseCoins} Coin)\n` +
      `🔑 Topup: ${topupId}`
    );
  } catch (e) { /* swallow */ }
}
