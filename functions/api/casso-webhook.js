/**
 * Casso Webhook Handler (Optimized for Cloudflare)
 * MotionAI Studio - Automated Top-up
 */

const SA_EMAIL = "firebase-adminsdk-hwcu9@notes-10acb.iam.gserviceaccount.com";
const SA_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC2d/MFFCwrAoSh\naXUQotOgTw3hzBTsnVdoeS0/JJlHnXkIG3WGOn/tcQyZZXs9tGFWr4TEczGzzNj0\nD+nGBh8DEBos44w/nkL6O755n7vRDiF9a0bPuyB65m7zkvwTQgprt+L8tdHIAWOU\nDByYnaYLOJRppemo6u8lC9SjFIDcXAMNfpGY3a18MeyyIarC/MfPstJzAWXUcSda\nqir/k9Lstv4NBNuUf/GNDEWgXL8o+44a0tkIXxeaQMHQMUw+PyjEYt1nWWZIdYdj\n27G+81C+r6fLMEbQLQO00CqRq+qAv28vgpBr8OiX9vp9Xgi1fxUO788dIK4jxeI4\na53irQYXAgMBAAECggEAFuM31/i+S4zOzyJXvUT3T6Hq51o+e6mGx8N/Ye64zUta\n3aH4HWSkHEf0YR9iFIzWMtXkTPH4F4oH4qFGXQDyjeNMrTnDo006MIIi88WN/PyN\nRdqZcMATpGbYHvReaxn7DaTss28pB7Ho6C6Wvav0om6v6wqVIwuJALgZrXUKbtlj\nPkoOyAxndjTl+eSUrMyfUtiwe/rpICjbf+LCZEMPMdiXGsSRXZyARUQ0GgoH8UXZ\nH/wdAbKcwOSVWt5/aXraVE3uYkChwYljoZbj1/o4EB4AMiwymo201uyv5nOHCWTG\ncSA1+LXxyzt0UoMTpe3AhYCB8cqsohTOfc/GeHjDUQKBgQDwmoG03x2OC6RXC20E\no3wlPd3Ex0diiT6HtqrarFPIh3aj7f2aHX34C3q8x5iobxfOTTvASxr8t4C7fWEu\nSHnpNrQljCFPNKe+ChE+FZOalGAfxsgcRIDWq/TtPXbV0EeScbzYQQVXqzxhQulG\nYfgBUX/DWJUo8SvL37iU8FIUhwKBgQDCJRfUJIuGNCSBxhRAbwdtiVCJDHytE2xu\n4Xp8Z9IcpcCgRa9ymdAK6+sGMy6AGZwsXjxdnW+AoBixXtqSZj70rxreB8BNsc/m\nIFV0Zcdpe+pXohyPq5lCvHsMZq01y50wz7CKQHER/F6up6RSrup7muaSoglNxetd\nYH319Up18QKBgQC4t0XhIHHGPbXbhdAagZCr3sVFb2Cki41QD7M30pk4GJfC3tGV\n4hJ1vgpqqCnRFgkGv1CiHocHgbH5Pxa+u7Gsk+zV7rEb5+boBT6blWEOid8KRkgX\nO5hWNwoAoPF80TxBd8Rtme2KEtJ2MTJ6cHhAOtuFk5pgJldjW8yPu7ioPQKBgCtH\vaIra3dFlIXhtI4QsmU24V9MC1dCJ0Aov/eP5YVBZknUfyJbK8fjhAdjzY/9JZW2\nhFqSSFMyXY7dCHjulkZR6vloXPR1GVXCC4rhTa00VK+okhltNcNs5TmEgkSl2asS\nAdcwOoS58BmbgcR0/g0EITa7LLvLzYaJhksYnbrhAoGADoCtjy6nWZ9lOjY5DPIf\nMcPINLzIyOc/2WXO/daBhXLBmTNGFQEBBKFs3OPQaSDhLIdmjdwziip3MWHOhV1H\nngDpF19eDW/q1jOsJnh12nkVbThDyViEKqHyAQxuEKcggHsy1dxnUFafB+9EKDwt\nykFzhHEL1aTSxki97vcoqEg=\n-----END PRIVATE KEY-----\n";
const PROJECT_ID = "notes-10acb";

export const webhookHandler = {
  async onRequestPost(context) {
    const { request } = context;
    try {
      const body = await request.json();
      if (!body.data || !Array.isArray(body.data)) return new Response("No data", { status: 400 });

      // 1. Get Google Access Token
      const accessToken = await getAccessToken();

      for (const transaction of body.data) {
        const description = (transaction.description || "").toUpperCase();
        const amount = transaction.amount || 0;

        // Pattern: [Number] COIN [Code]
        const match = description.match(/(\d+)\s*COIN\s*([A-Z0-9]{4,6})/);
        if (match) {
          const coins = parseInt(match[1]);
          const code = match[0];

          // 2. Find Pending Topup
          const topup = await findTopup(accessToken, code);
          if (topup && topup.status === "pending") {
             // 3. Grant Coins
             await grantCoins(accessToken, topup.userId, coins, topup.id);
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
};

// --- Helpers ---

async function getAccessToken() {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64(JSON.stringify({
    iss: SA_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp, iat
  }));

  const message = `${header}.${payload}`;
  
  // Clean Key for Cloudflare
  const pemContents = SA_KEY.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binaryDer = str2ab(atob(pemContents));
  
  const key = await crypto.subtle.importKey(
    "pkcs8", binaryDer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
  const jwt = `${message}.${b64(ab2str(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function findTopup(token, content) {
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
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  
  // Get Current
  const userRes = await fetch(`${baseUrl}/users/${userId}`, { headers: { "Authorization": `Bearer ${token}` } });
  const userData = await userRes.json();
  const current = parseInt(userData.fields.coins?.integerValue || 0);

  // Patch User
  await fetch(`${baseUrl}/users/${userId}?updateMask.fieldPaths=coins`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ fields: { coins: { integerValue: current + coins } } })
  });

  // Patch Topup
  await fetch(`${baseUrl}/topups/${topupId}?updateMask.fieldPaths=status`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ fields: { status: { stringValue: "approved" } } })
  });
}

function b64(str) { return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) { bufView[i] = str.charCodeAt(i); }
  return buf;
}
function ab2str(buf) { return String.fromCharCode.apply(null, new Uint8Array(buf)); }
