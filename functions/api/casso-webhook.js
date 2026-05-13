/**
 * Casso Webhook Handler (Production Ready - Hardcoded Credentials)
 * MotionAI Studio - Automated Top-up
 */

const TELEGRAM_BOT_TOKEN = '8676046240:AAE14lDxAj9otGTjVnd8Smr2__Wg-J2dCLc';
const TELEGRAM_CHAT_ID = '6067707939';

// Dán toàn bộ nội dung file JSON của bạn vào đây
const SERVICE_ACCOUNT = {
  "type": "service_account",
  "project_id": "notes-10acb",
  "private_key_id": "01b66c6bbf110660e537cebce6d5cf861a4bc043",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC2d/MFFCwrAoSh\naXUQotOgTw3hzBTsnVdoeS0/JJlHnXkIG3WGOn/tcQyZZXs9tGFWr4TEczGzzNj0\nD+nGBh8DEBos44w/nkL6O755n7vRDiF9a0bPuyB65m7zkvwTQgprt+L8tdHIAWOU\nDByYnaYLOJRppemo6u8lC9SjFIDcXAMNfpGY3a18MeyyIarC/MfPstJzAWXUcSda\nqir/k9Lstv4NBNuUf/GNDEWgXL8o+44a0tkIXxeaQMHQMUw+PyjEYt1nWWZIdYdj\n27G+81C+r6fLMEbQLQO00CqRq+qAv28vgpBr8OiX9vp9Xgi1fxUO788dIK4jxeI4\na53irQYXAgMBAAECggEAFuM31/i+S4zOzyJXvUT3T6Hq51o+e6mGx8N/Ye64zUta\n3aH4HWSkHEf0YR9iFIzWMtXkTPH4F4oH4qFGXQDyjeNMrTnDo006MIIi88WN/PyN\nRdqZcMATpGbYHvReaxn7DaTss28pB7Ho6C6Wvav0om6v6wqVIwuJALgZrXUKbtlj\nPkoOyAxndjTl+eSUrMyfUtiwe/rpICjbf+LCZEMPMdiXGsSRXZyARUQ0GgoH8UXZ\nH/wdAbKcwOSVWt5/aXraVE3uYkChwYljoZbj1/o4EB4AMiwymo201uyv5nOHCWTG\ncSA1+LXxyzt0UoMTpe3AhYCB8cqsohTOfc/GeHjDUQKBgQDwmoG03x2OC6RXC20E\no3wlPd3Ex0diiT6HtqrarFPIh3aj7f2aHX34C3q8x5iobxfOTTvASxr8t4C7fWEu\nSHnpNrQljCFPNKe+ChE+FZOalGAfxsgcRIDWq/TtPXbV0EeScbzYQQVXqzxhQulG\nYfgBUX/DWJUo8SvL37iU8FIUhwKBgQDCJRfUJIuGNCSBxhRAbwdtiVCJDHytE2xu\n4Xp8Z9IcpcCgRa9ymdAK6+sGMy6AGZwsXjxdnW+AoBixXtqSZj70rxreB8BNsc/m\nIFV0Zcdpe+pXohyPq5lCvHsMZq01y50wz7CKQHER/F6up6RSrup7muaSoglNxetd\nYH319Up18QKBgQC4t0XhIHHGPbXbhdAagZCr3sVFb2Cki41QD7M30pk4GJfC3tGV\n4hJ1vgpqqCnRFgkGv1CiHocHgbH5Pxa+u7Gsk+zV7rEb5+boBT6blWEOid8KRkgX\nO5hWNwoAoPF80TxBd8Rtme2KEtJ2MTJ6cHhAOtuFk5pgJldjW8yPu7ioPQKBgCtH\nvaIra3dFlIXhtI4QsmU24V9MC1dCJ0Aov/eP5YVBZknUfyJbK8fjhAdjzY/9JZW2\nhFqSSFMyXY7dCHjulkZR6vloXPR1GVXCC4rhTa00VK+okhltNcNs5TmEgkSl2asS\AdcwOoS58BmbgcR0/g0EITa7LLvLzYaJhksYnbrhAoGADoCtjy6nWZ9lOjY5DPIf\nMcPINLzIyOc/2WXO/daBhXLBmTNGFQEBBKFs3OPQaSDhLIdmjdwziip3MWHOhV1H\nngDpF19eDW/q1jOsJnh12nkVbThDyViEKqHyAQxuEKcggHsy1dxnUFafB+9EKDwt\nykFzhHEL1aTSxki97vcoqEg=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-hwcu9@notes-10acb.iam.gserviceaccount.com",
  "client_id": "115715423188555891465",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-hwcu9%40notes-10acb.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

export const webhookHandler = {
  async onRequestPost(context) {
    const { request } = context;
    try {
      const body = await request.json();
      if (!body.data || !Array.isArray(body.data)) return new Response("No data", { status: 400 });

      // Lấy Token bằng thông tin hardcoded
      const accessToken = await getAccessToken(SERVICE_ACCOUNT.client_email, SERVICE_ACCOUNT.private_key);

      // Fetch all pending topups once
      const pendingTopups = await getAllPendingTopups(accessToken);

      for (const transaction of body.data) {
        const description = (transaction.description || "").toUpperCase();
        const amount = transaction.amount || 0;
        const cleanDesc = description.replace(/\s+/g, "");

        // Find match in pending topups
        const topupIndex = pendingTopups.findIndex(t => {
          const cleanContent = t.transferContent.toUpperCase().replace(/\s+/g, "");
          return cleanDesc.includes(cleanContent);
        });

        if (topupIndex !== -1) {
          const topup = pendingTopups[topupIndex];
          // Remove from list to prevent double processing in this loop
          pendingTopups.splice(topupIndex, 1);

          const coins = topup.coins;
          const code = topup.transferContent;

          if (topup.status === "pending") {
             // KIỂM TRA BẢO MẬT: Xác minh số tiền chuyển khoản thực tế có đủ không
             if (topup.amount && amount < topup.amount) {
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
      }

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      console.error("Critical Webhook Error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
};

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
  let pemContents = privateKey.trim()
    .replace(/^"|"$/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "")
    .replace(/[^A-Za-z0-9+/]/g, "");
    
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

async function getAllPendingTopups(token) {
  const PROJECT_ID = "notes-10acb";
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "topups" }],
        where: {
          fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "pending" } }
        }
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
        userName: fields.userName?.stringValue || 'Khách',
        userEmail: fields.userEmail?.stringValue || '',
        amount: parseInt(fields.amount?.integerValue || fields.amount?.doubleValue || fields.amount?.stringValue || 0),
        transferContent: fields.transferContent?.stringValue || '',
        coins: parseInt(fields.coins?.integerValue || fields.coins?.stringValue || 0)
      };
    });
}

async function grantCoins(token, userId, coins, topupId) {
  const PROJECT_ID = "notes-10acb";
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
