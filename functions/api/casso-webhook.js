/**
 * Casso Webhook Handler (Production Ready)
 * MotionAI Studio - Automated Top-up
 */

export const webhookHandler = {
  async onRequestPost(context) {
    const { request, env } = context;
    try {
      const body = await request.json();
      if (!body.data || !Array.isArray(body.data)) return new Response("No data", { status: 400 });

      // Lấy Token bằng Biến môi trường
      const accessToken = await getAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);

      for (const transaction of body.data) {
        const description = (transaction.description || "").toUpperCase();
        const amount = transaction.amount || 0;

        const match = description.match(/(\d+)\s*COIN\s*([A-Z0-9]{4,6})/);
        if (match) {
          const coins = parseInt(match[1]);
          const code = match[0];

          const topup = await findTopup(accessToken, code);
          if (topup && topup.status === "pending") {
             await grantCoins(accessToken, topup.userId, coins, topup.id);
             console.log(`Successfully granted ${coins} coins to user ${topup.userId}`);
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
  if (!email || !privateKey) throw new Error("Thiếu biến môi trường FIREBASE_CLIENT_EMAIL hoặc FIREBASE_PRIVATE_KEY");

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
  
  // Clean PEM Key - Cách làm mới an toàn hơn
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  let pemContents = privateKey.trim();
  
  if (pemContents.includes(pemHeader)) {
    pemContents = pemContents.substring(pemContents.indexOf(pemHeader) + pemHeader.length, pemContents.indexOf(pemFooter));
  }
  
  // Xóa sạch mọi thứ không phải Base64
  pemContents = pemContents.replace(/[^A-Za-z0-9+/]/g, "");
    
  // Bù dấu = ở cuối
  while (pemContents.length % 4 !== 0) pemContents += "=";
    
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  
  let key;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8", binaryDer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
    );
  } catch (e) {
    throw new Error(`Lỗi định dạng mã khóa (PKCS8): ${e.message}. Hãy kiểm tra lại mã bạn dán vào Cloudflare có đủ ký tự không.`);
  }
  
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

async function findTopup(token, content) {
  const PROJECT_ID = "notes-10acb";
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "topups" }],
        where: {
          fieldFilter: { field: { fieldPath: "transferContent" }, op: "EQUAL", value: { stringValue: content } }
        },
        limit: 1
      }
    })
  });
  const data = await res.json();
  if (data?.[0]?.document) {
    const doc = data[0].document;
    return { id: doc.name.split("/").pop(), userId: doc.fields.userId.stringValue, status: doc.fields.status.stringValue };
  }
  return null;
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
