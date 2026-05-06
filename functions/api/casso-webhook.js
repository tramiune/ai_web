/**
 * Casso Webhook Handler for MotionAI Studio
 * Endpoint: /api/casso-webhook
 */

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();
        
        // Casso gửi danh sách giao dịch trong mảng 'data'
        if (!body.data || !Array.isArray(body.data)) {
            return new Response("No data", { status: 400 });
        }

        const FIREBASE_API_KEY = "AIzaSyAJ-4VLQNY2MBonRizyx8cRpqcGZhur2gI";
        const PROJECT_ID = "notes-10acb";

        for (const transaction of body.data) {
            const description = transaction.description || "";
            const amount = transaction.amount || 0;

            // Tìm mã dạng: 55 COIN ABCD
            const match = description.match(/(\d+)\s*COIN\s*([A-Z0-9]{4})/i);
            
            if (match) {
                const coinsToGrant = parseInt(match[1]);
                const fullCode = match[0].toUpperCase();

                console.log(`Processing: ${fullCode} for ${amount} VND`);

                // 1. Tìm yêu cầu nạp tiền (topup) tương ứng trong Firestore
                const topup = await findTopupByContent(PROJECT_ID, FIREBASE_API_KEY, fullCode);
                
                if (topup && topup.status === "pending") {
                    // 2. Cộng coin cho User
                    await updateUserCoins(PROJECT_ID, FIREBASE_API_KEY, topup.userId, coinsToGrant);
                    
                    // 3. Đánh dấu đơn nạp thành 'approved'
                    await markTopupApproved(PROJECT_ID, FIREBASE_API_KEY, topup.id);
                    
                    console.log(`Successfully granted ${coinsToGrant} coins to user ${topup.userId}`);
                }
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("Webhook Error:", err);
        return new Response(err.message, { status: 500 });
    }
}

// --- Firestore REST API Helpers ---

async function findTopupByContent(projectId, apiKey, content) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
    const query = {
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
    };

    const res = await fetch(url, {
        method: "POST",
        body: JSON.stringify(query)
    });
    const data = await res.json();
    
    if (data && data[0] && data[0].document) {
        const doc = data[0].document;
        const id = doc.name.split("/").pop();
        return {
            id,
            userId: doc.fields.userId.stringValue,
            status: doc.fields.status.stringValue
        };
    }
    return null;
}

async function updateUserCoins(projectId, apiKey, userId, coinsToAdd) {
    // Lấy số coin hiện tại
    const getUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}?key=${apiKey}`;
    const getRes = await fetch(getUrl);
    const userData = await getRes.json();
    
    const currentCoins = parseInt(userData.fields.coins?.integerValue || 0);
    const newCoins = currentCoins + coinsToAdd;

    // Cập nhật coin mới
    const patchUrl = `${getUrl}&updateMask.fieldPaths=coins&updateMask.fieldPaths=updatedAt`;
    await fetch(patchUrl, {
        method: "PATCH",
        body: JSON.stringify({
            fields: {
                coins: { integerValue: newCoins },
                updatedAt: { timestampValue: new Date().toISOString() }
            }
        })
    });
}

async function markTopupApproved(projectId, apiKey, topupId) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/topups/${topupId}?key=${apiKey}&updateMask.fieldPaths=status`;
    await fetch(url, {
        method: "PATCH",
        body: JSON.stringify({
            fields: {
                status: { stringValue: "approved" }
            }
        })
    });
}
