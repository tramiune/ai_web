/**
 * Casso Webhook Handler with Service Account Auth
 * MotionAI Studio - Automated Top-up
 */

const SERVICE_ACCOUNT = {
  "project_id": "notes-10acb",
  "client_email": "firebase-adminsdk-hwcu9@notes-10acb.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC2d/MFFCwrAoSh\naXUQotOgTw3hzBTsnVdoeS0/JJlHnXkIG3WGOn/tcQyZZXs9tGFWr4TEczGzzNj0\nD+nGBh8DEBos44w/nkL6O755n7vRDiF9a0bPuyB65m7zkvwTQgprt+L8tdHIAWOU\nDByYnaYLOJRppemo6u8lC9SjFIDcXAMNfpGY3a18MeyyIarC/MfPstJzAWXUcSda\nqir/k9Lstv4NBNuUf/GNDEWgXL8o+44a0tkIXxeaQMHQMUw+PyjEYt1nWWZIdYdj\n27G+81C+r6fLMEbQLQO00CqRq+qAv28vgpBr8OiX9vp9Xgi1fxUO788dIK4jxeI4\na53irQYXAgMBAAECggEAFuM31/i+S4zOzyJXvUT3T6Hq51o+e6mGx8N/Ye64zUta\n3aH4HWSkHEf0YR9iFIzWMtXkTPH4F4oH4qFGXQDyjeNMrTnDo006MIIi88WN/PyN\nRdqZcMATpGbYHvReaxn7DaTss28pB7Ho6C6Wvav0om6v6wqVIwuJALgZrXUKbtlj\nPkoOyAxndjTl+eSUrMyfUtiwe/rpICjbf+LCZEMPMdiXGsSRXZyARUQ0GgoH8UXZ\nH/wdAbKcwOSVWt5/aXraVE3uYkChwYljoZbj1/o4EB4AMiwymo201uyv5nOHCWTG\ncSA1+LXxyzt0UoMTpe3AhYCB8cqsohTOfc/GeHjDUQKBgQDwmoG03x2OC6RXC20E\no3wlPd3Ex0diiT6HtqrarFPIh3aj7f2aHX34C3q8x5iobxfOTTvASxr8t4C7fWEu\nSHnpNrQljCFPNKe+ChE+FZOalGAfxsgcRIDWq/TtPXbV0EeScbzYQQVXqzxhQulG\nYfgBUX/DWJUo8SvL37iU8FIUhwKBgQDCJRfUJIuGNCSBxhRAbwdtiVCJDHytE2xu\n4Xp8Z9IcpcCgRa9ymdAK6+sGMy6AGZwsXjxdnW+AoBixXtqSZj70rxreB8BNsc/m\nIFV0Zcdpe+pXohyPq5lCvHsMZq01y50wz7CKQHER/F6up6RSrup7muaSoglNxetd\nYH319Up18QKBgQC4t0XhIHHGPbXbhdAagZCr3sVFb2Cki41QD7M30pk4GJfC3tGV\n4hJ1vgpqqCnRFgkGv1CiHocHgbH5Pxa+u7Gsk+zV7rEb5+boBT6blWEOid8KRkgX\nO5hWNwoAoPF80TxBd8Rtme2KEtJ2MTJ6cHhAOtuFk5pgJldjW8yPu7ioPQKBgCtH\vaIra3dFlIXhtI4QsmU24V9MC1dCJ0Aov/eP5YVBZknUfyJbK8fjhAdjzY/9JZW2\nhFqSSFMyXY7dCHjulkZR6vloXPR1GVXCC4rhTa00VK+okhltNcNs5TmEgkSl2asS\nAdcwOoS58BmbgcR0/g0EITa7LLvLzYaJhksYnbrhAoGADoCtjy6nWZ9lOjY5DPIf\nMcPINLzIyOc/2WXO/daBhXLBmTNGFQEBBKFs3OPQaSDhLIdmjdwziip3MWHOhV1H\nngDpF19eDW/q1jOsJnh12nkVbThDyViEKqHyAQxuEKcggHsy1dxnUFafB+9EKDwt\nykFzhHEL1aTSxki97vcoqEg=\n-----END PRIVATE KEY-----\n"
};

export const webhookHandler = {
    async onRequestPost(context) {
    const { request } = context;
    try {
        const body = await request.json();
        if (!body.data || !Array.isArray(body.data)) return new Response("No data", { status: 400 });

        // 1. Lấy Access Token từ Google
        const accessToken = await getGoogleAccessToken(SERVICE_ACCOUNT);

        for (const transaction of body.data) {
            const description = (transaction.description || "").toUpperCase();
            const amount = transaction.amount || 0;

            // Regex tìm mã: 55 COIN ABCD
            const match = description.match(/(\d+)\s*COIN\s*([A-Z0-9]{4})/);
            
            if (match) {
                const coinsToGrant = parseInt(match[1]);
                const fullCode = match[0];

                console.log(`Tiền về! Mã: ${fullCode}, Số tiền: ${amount}`);

                // 2. Tìm yêu cầu nạp tiền trong Firestore
                const topup = await findTopup(SERVICE_ACCOUNT.project_id, accessToken, fullCode);
                
                if (topup && topup.status === "pending") {
                    // 3. Cộng coin và đổi trạng thái đơn
                    await grantCoinsAndApprove(SERVICE_ACCOUNT.project_id, accessToken, topup.userId, coinsToGrant, topup.id);
                    console.log(`Đã nạp ${coinsToGrant} coin cho user ${topup.userId}`);
                }
            }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    } catch (err) {
        console.error("Webhook Error:", err);
        return new Response(err.message, { status: 500 });
    }
  }
};

// --- Auth & Firestore REST Functions ---

async function getGoogleAccessToken(sa) {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = b64(JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        exp, iat
    }));

    const message = `${header}.${payload}`;
    const signature = await signRS256(message, sa.private_key);
    const jwt = `${message}.${signature}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    const data = await res.json();
    return data.access_token;
}

async function findTopup(projectId, token, content) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: "topups" }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "transferContent" },
                        op: "EQUAL",
                        value: { stringValue: content }
                    }
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

async function grantCoinsAndApprove(projectId, token, userId, coins, topupId) {
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    
    // Get current coins
    const userRes = await fetch(`${baseUrl}/users/${userId}`, { headers: { "Authorization": `Bearer ${token}` } });
    const userData = await userRes.json();
    const currentCoins = parseInt(userData.fields.coins?.integerValue || 0);

    // Update User & Topup Status (Thực hiện tuần tự)
    await fetch(`${baseUrl}/users/${userId}?updateMask.fieldPaths=coins`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ fields: { coins: { integerValue: currentCoins + coins } } })
    });

    await fetch(`${baseUrl}/topups/${topupId}?updateMask.fieldPaths=status`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ fields: { status: { stringValue: "approved" } } })
    });
}

function b64(str) { return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

async function signRS256(message, pem) {
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length).replace(/\s/g, "");
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const key = await crypto.subtle.importKey("pkcs8", binaryDer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
    return b64(String.fromCharCode(...new Uint8Array(signature)));
}
