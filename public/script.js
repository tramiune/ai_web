/**
 * script.js - Core logic for MotionAI Studio
 */

const TELEGRAM_BOT_TOKEN = '8676046240:AAE14lDxAj9otGTjVnd8Smr2__Wg-J2dCLc';
const TELEGRAM_CHAT_ID = '6067707939';

// --- Data Constants ---
const COIN_PACKAGES = [
    { id: 'starter', name: 'Starter', coins: 10, price: '10.000đ', amount: 10000 },
    { id: 'creator', name: 'Creator', coins: 55, price: '50.000đ', amount: 50000, featured: true, note: 'Tặng 5 Coin' },
    { id: 'studio', name: 'Studio', coins: 120, price: '100.000đ', amount: 100000, note: 'Tặng 20 Coin' },
    { id: 'pro-studio', name: 'Pro Studio', coins: 300, price: '200.000đ', amount: 200000, note: 'Tặng 100 Coin' }
];

const MODELS = {
    basic: { name: "Model Tiêu chuẩn", cost: 6 },
    pro: { name: "Model Cao cấp", cost: 12 }
};

let currentUser = null;
let selectedTopupPackage = null;
let initialCoinsBeforeTopup = 0; // Để theo dõi số dư trước khi nạp
const SUPER_ADMIN_EMAILS = ["traderfinn0312@gmail.com", "dinhhoangvan.hh@gmail.com"]; // Danh sách admin khởi tạo
const STATUS_MAP = {
    'pending': 'Đang chờ',
    'approved': 'Đã duyệt',
    'rejected': 'Bị từ chối',
    'processing': 'Đang xử lý',
    'completed': 'Hoàn thành',
    'failed': 'Thất bại'
};

// --- App Initialization ---
export function initAppLogic() {
    // Global Error Handler for debugging
    window.onerror = function (msg, url, lineNo, columnNo, error) {
        const message = [
            'Message: ' + msg,
            'Line: ' + lineNo,
            'Column: ' + columnNo,
            'Error object: ' + JSON.stringify(error)
        ].join(' - ');
        console.error("Global Error:", message);
        showToast("⚠️ Phát hiện lỗi hệ thống: " + msg);
        return false;
    };

    const { auth, onAuthStateChanged } = window.firebase;

    onAuthStateChanged(auth, (user) => {
        try {
            if (user) {
                currentUser = user;
                handleUserLoggedIn(user);
            } else {
                currentUser = null;
                handleUserLoggedOut();
            }
        } catch (e) {
            console.error("Auth Change Error:", e);
            showToast("Lỗi xác thực: " + e.message);
        }
    });

    setupEventListeners();
    renderPricing();
    syncVideos();
}

// --- Video Synchronization ---
function syncVideos() {
    const v1 = document.getElementById('preview-motion');
    const v2 = document.getElementById('preview-result');

    if (!v1 || !v2) return;

    v1.addEventListener('play', () => {
        v2.currentTime = v1.currentTime;
        v2.play();
    });

    v1.addEventListener('pause', () => v2.pause());

    setInterval(() => {
        if (Math.abs(v1.currentTime - v2.currentTime) > 0.1) {
            v2.currentTime = v1.currentTime;
        }
    }, 1000);
}

// --- Auth Functions ---
async function login() {
    const { auth, GoogleAuthProvider, signInWithPopup } = window.firebase;
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        showToast("Đăng nhập thành công!");
    } catch (error) {
        console.error("Login Error", error);
        showToast("Đăng nhập thất bại.");
    }
}

async function logout() {
    const { auth, signOut } = window.firebase;
    try {
        await signOut(auth);
        showToast("Đã đăng xuất.");
    } catch (error) {
        console.error("Logout Error", error);
    }
}

// --- User Profile & Coin Balance ---
async function handleUserLoggedIn(user) {
    const { db, doc, getDoc, setDoc, onSnapshot } = window.firebase;

    // Hiển thị Profile Menu thay vì ghi đè HTML
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('user-profile-menu').style.display = 'block';
    document.getElementById('user-avatar').src = user.photoURL;
    document.getElementById('dropdown-user-name').innerText = user.displayName;
    document.getElementById('dropdown-user-email').innerText = user.email;
    
    // Hiển thị Dashboard link trong dropdown
    const dbItem = document.getElementById('db-dropdown-item');
    if (dbItem) dbItem.style.display = 'flex';

    // Xử lý hành động đang chờ (ví dụ: mở modal tạo đơn sau khi login)
    if (window.pendingAction === 'openOrderModal') {
        window.pendingAction = null;
        setTimeout(() => {
            window.openOrderModal();
        }, 500);
    }

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // Bootstrap Super Admin from hardcoded list to Database
    const isBootstrapSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email);

    if (!userSnap.exists()) {
        await setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            coins: 0,
            role: isBootstrapSuperAdmin ? 'super-admin' : 'user', // Tự động gán role vào DB
            createdAt: window.firebase.serverTimestamp(),
            updatedAt: window.firebase.serverTimestamp()
        });
    } else {
        // Nếu đã có user nhưng email thuộc list bootstrap mà chưa có role admin thì cập nhật
        const userData = userSnap.data();
        if (isBootstrapSuperAdmin && userData.role !== 'super-admin') {
            await window.firebase.updateDoc(userRef, { role: 'super-admin' });
        }
    }

    onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const currentCoins = data.coins || 0;
            
            // Tự động nhận biết nạp coin thành công
            const topupModal = document.getElementById('topup-modal');
            if (topupModal && topupModal.style.display === 'flex' && currentCoins > initialCoinsBeforeTopup) {
                showToast("✨ Thanh toán thành công! Đã cộng coin vào tài khoản.");
                closeModal('topup-modal');
                // Hiệu ứng pháo hoa hoặc rung nhẹ balance
                document.getElementById('coin-balance').classList.add('coin-update-glow');
                setTimeout(() => document.getElementById('coin-balance').classList.remove('coin-update-glow'), 2000);
            }

            document.getElementById('coin-balance').innerText = currentCoins;
            document.getElementById('user-greeting').innerText = `Chào mừng, ${data.displayName}!`;
            document.getElementById('user-email').innerText = data.email;

            // Check Admin Rights từ Database
            const isAdmin = data.role === 'admin' || data.role === 'super-admin';
            const isSuperAdmin = data.role === 'super-admin';

            if (isAdmin) {
                document.getElementById('admin-panel').style.display = 'block';
                loadAdminPanel();
                if (isSuperAdmin) {
                    document.getElementById('tab-users').style.display = 'block';
                }
            } else {
                document.getElementById('admin-panel').style.display = 'none';
            }
        }
    });

    loadMyOrders();
    loadMyTopups();
    showDashboard();
}

function handleUserLoggedOut() {
    document.getElementById('login-btn').style.display = 'flex';
    document.getElementById('user-profile-menu').style.display = 'none';
    
    const dbItem = document.getElementById('db-dropdown-item');
    if (dbItem) dbItem.style.display = 'none';
    
    showLanding();
}

function showDashboard() {
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('user-dashboard').style.display = 'block';
    window.scrollTo(0, 0);
}

function showLanding() {
    document.getElementById('landing-page').style.display = 'block';
    document.getElementById('user-dashboard').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
}

window.toggleDashboard = () => {
    if (document.getElementById('user-dashboard').style.display === 'none') {
        showDashboard();
    } else {
        showLanding();
    }
};

window.loginUser = login;
window.logoutUser = logout;
window.showLanding = showLanding;
window.showDashboard = showDashboard;

// Helper for navbar links
window.navTo = (target) => {
    if (target === 'user-dashboard') {
        showDashboard();
    } else if (target === 'landing-page') {
        showLanding();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // Cuộn đến section trong landing page
        showLanding();
        setTimeout(() => {
            const el = document.getElementById(target);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
};

window.toggleUserMenu = (e) => {
    if (e) e.stopPropagation();
    document.getElementById('dropdown-menu').classList.toggle('show');
};

// Đóng menu khi click ra ngoài
window.addEventListener('click', () => {
    const menu = document.getElementById('dropdown-menu');
    if (menu) menu.classList.remove('show');
});

window.logout = logout;

// Custom Confirm Helper
window.niceConfirm = ({ title, message, icon, onConfirm }) => {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = message;
    document.getElementById('confirm-icon').innerText = icon || '⚠️';

    const yesBtn = document.getElementById('confirm-yes-btn');
    // Clear old listeners
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

    newYesBtn.onclick = () => {
        closeModal('confirm-modal');
        onConfirm();
    };

    modal.style.display = 'flex';
};

// Preview Helper
window.handlePreview = (input, containerId) => {
    const container = document.getElementById(containerId);
    const file = input.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        container.style.display = 'block';
        if (file.type.startsWith('image/')) {
            container.innerHTML = `<img src="${url}">`;
        } else {
            container.innerHTML = `<video src="${url}" autoplay muted loop></video>`;
        }
    }
};

// --- Rendering ---
function renderPricing() {
    // Render into landing page section if it exists
    const coinGrid = document.getElementById('coin-packages');
    const modalCoinGrid = document.getElementById('modal-coin-packages');

    const html = COIN_PACKAGES.map(pkg => `
        <div class="price-card ${pkg.featured ? 'featured' : ''}">
            ${pkg.featured ? '<div class="featured-badge">Bán chạy nhất</div>' : ''}
            <h4>${pkg.name}</h4>
            <div class="price-coins">${pkg.coins} 🪙</div>
            <div class="price-value">${pkg.price}</div>
            ${pkg.note ? `<div style="font-size: 0.75rem; color: var(--accent); margin-bottom: 1rem; font-weight: 600;">${pkg.note}</div>` : ''}
            <button class="btn-primary" onclick="window.selectTopup('${pkg.id}')">Chọn gói</button>
        </div>
    `).join('');

    if (coinGrid) coinGrid.innerHTML = html;
    if (modalCoinGrid) modalCoinGrid.innerHTML = html;
}

// --- Modals ---
window.openModal = (id) => {
    document.getElementById(id).style.display = 'flex';
};

window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

window.openTopupModal = () => {
    window.openPricingModal();
};

window.openPricingModal = () => {
    if (!currentUser) return login();
    window.openModal('pricing-modal');
};

window.selectTopup = async (id) => {
    if (!currentUser) return login();
    selectedTopupPackage = COIN_PACKAGES.find(p => p.id === id);
    
    // Lưu số dư hiện tại để theo dõi biến động khi nạp
    initialCoinsBeforeTopup = parseInt(document.getElementById('coin-balance').innerText) || 0;

    // Close pricing modal if open
    closeModal('pricing-modal');

    // Generate unique random code: [CoinAmount] COIN [RandomStr]
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const transferContent = `${selectedTopupPackage.coins} COIN ${randomStr}`;

    // --- Tự động tạo bản ghi nạp tiền để Webhook Casso có thể tìm thấy ---
    const { db, collection, addDoc, serverTimestamp } = window.firebase;
    try {
        await addDoc(collection(db, "topups"), {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: currentUser.displayName,
            packageName: selectedTopupPackage.name,
            coins: selectedTopupPackage.coins,
            amount: selectedTopupPackage.amount,
            transferContent: transferContent,
            status: "pending",
            createdAt: serverTimestamp(),
            isAutomated: true // Đánh dấu đây là đơn tạo tự động
        });
        console.log("📝 Đã tạo bản ghi nạp tiền tự động:", transferContent);
    } catch (err) {
        console.error("Lỗi khi tạo bản ghi nạp tiền:", err);
        // Vẫn tiếp tục hiện QR cho khách, Admin có thể check tay nếu lỗi DB
    }

    document.getElementById('topup-package-info').innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 0.8rem; opacity: 0.7;">Gói nạp</div>
                <div style="font-weight: 700;">${selectedTopupPackage.name}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.8rem; opacity: 0.7;">Thanh toán</div>
                <div style="color: var(--accent); font-weight: 800;">${selectedTopupPackage.price}</div>
            </div>
        </div>
    `;

    document.getElementById('transfer-code').innerText = transferContent;

    // QR Loading handling
    const qrImg = document.getElementById('qr-code-img');
    const qrLoader = document.getElementById('qr-loader');

    qrImg.style.display = 'none';
    qrLoader.style.display = 'flex';

    qrImg.onload = () => {
        qrLoader.style.display = 'none';
        qrImg.style.display = 'block';
    };

    // Generate VietQR Link
    const amount = selectedTopupPackage.amount;
    const bankId = "MB"; // MB Bank
    const accNo = "0965951536";
    const accName = "VAN DINH HOANG";
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accName)}`;

    qrImg.src = qrUrl;

    window.openModal('topup-modal');
};

window.openOrderModal = () => {
    if (!currentUser) {
        window.pendingAction = 'openOrderModal';
        return login();
    }
    window.openModal('order-modal');
};

window.niceConfirm = ({ title, message, icon, onConfirm }) => {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = message;
    document.getElementById('confirm-icon').innerText = icon || '❓';
    
    const yesBtn = document.getElementById('confirm-yes-btn');
    const newBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);
    
    newBtn.onclick = () => {
        closeModal('confirm-modal');
        if (onConfirm) onConfirm();
    };
    
    window.openModal('confirm-modal');
};

window.handlePreview = (input, containerId) => {
    const container = document.getElementById(containerId);
    const file = input.files[0];
    if (!file) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '';

    if (file.type.startsWith('image/')) {
        if (file.size > 10 * 1024 * 1024) {
            showToast("⚠️ Ảnh quá nặng! Vui lòng chọn ảnh dưới 10MB.");
            input.value = '';
            return;
        }
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '8px';
        img.onload = () => URL.revokeObjectURL(img.src);
        container.appendChild(img);
    } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            const duration = video.duration;
            if (duration > 20) {
                showToast("⚠️ Video quá dài! Vui lòng chọn video dưới 20 giây.");
                input.value = '';
                URL.revokeObjectURL(video.src);
                return;
            }
            const previewVideo = document.createElement('video');
            previewVideo.src = URL.createObjectURL(file);
            previewVideo.controls = false;
            previewVideo.autoplay = true;
            previewVideo.muted = true;
            previewVideo.loop = true;
            previewVideo.style.width = '100%';
            previewVideo.style.height = '100%';
            previewVideo.style.objectFit = 'cover';
            previewVideo.style.borderRadius = '8px';
            container.appendChild(previewVideo);
        };
        video.src = URL.createObjectURL(file);
    }
};

// --- File Upload Helper ---
async function uploadFile(file, folder) {
    let workerUrl = "https://motionai-upload-api.traderfinn0312.workers.dev";
    if (workerUrl.endsWith('/')) workerUrl = workerUrl.slice(0, -1);

    const fileName = `${folder}/${Date.now()}_${file.name}`;
    const fetchUrl = `${workerUrl}/?file=${encodeURIComponent(fileName)}&t=${Date.now()}`;
    
    const progressVal = document.getElementById('progress-val');
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', fetchUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                if (progressVal) progressVal.innerText = percent;
                console.log(`Progress: ${percent}%`);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (data.url) {
                        resolve(data.url);
                    } else {
                        reject(new Error("Không nhận được địa chỉ file từ máy chủ."));
                    }
                } catch (e) {
                    reject(new Error("Lỗi xử lý phản hồi từ máy chủ."));
                }
            } else {
                reject(new Error(`Máy chủ từ chối (${xhr.status}): ${xhr.responseText}`));
            }
        };

        xhr.onerror = () => {
            reject(new Error("❌ KHÔNG THỂ KẾT NỐI MÁY CHỦ! Vui lòng kiểm tra mạng hoặc VPN."));
        };

        xhr.send(file);
    });
}

// --- Form Submissions ---
async function setupEventListeners() {
    // Model Selection change cost
    document.querySelectorAll('input[name="model-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const cost = MODELS[e.target.value].cost;
            document.getElementById('submit-cost').innerText = cost;
        });
    });

    // Topup Form removed for automated flow
    // (Admin updates coins in Firestore -> Real-time listener detects change -> UI auto-closes)

    // Order Form (Updated for File Upload & New Pricing)
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return showToast("⚠️ Lỗi: Không tìm thấy phiên đăng nhập. Vui lòng F5.");

            const { db, doc, collection, runTransaction, serverTimestamp } = window.firebase;
            const submitBtn = document.getElementById('order-submit-btn');
            const progressDiv = document.getElementById('upload-progress');

            try {
                const modelKey = document.querySelector('input[name="model-type"]:checked').value;
                const serviceType = document.querySelector('input[name="service-type"]:checked').value;
                const model = MODELS[modelKey];

                const charFile = document.getElementById('file-char').files[0];
                const videoFile = document.getElementById('file-video').files[0];

                if (!charFile || !videoFile) return showToast("Vui lòng chọn đầy đủ file.");

                // Kiểm tra lại lần cuối trước khi upload
                if (charFile.size > 10 * 1024 * 1024) return showToast("⚠️ Ảnh vượt quá 10MB.");

                // Show loading
                submitBtn.disabled = true;
                submitBtn.innerText = "⏳ Đang kiểm tra số dư...";
                progressDiv.style.display = 'block';

                // 1. Check coins first (Transaction)
                // 1. Check coins first (Transaction)
                const userRef = doc(db, "users", currentUser.uid);
                const userSnap = await runTransaction(db, async (transaction) => {
                    const userDoc = await transaction.get(userRef);
                    const currentCoins = userDoc.data().coins || 0;
                    if (currentCoins < model.cost) {
                        throw "Không đủ coin!";
                    }
                    return currentCoins;
                });

                // 1b. Show Queue/Wait Time Confirmation
                const minWait = Math.floor(Math.random() * (15 - 10 + 1)) + 10; // 10-15
                const maxWait = Math.floor(Math.random() * (25 - 20 + 1)) + 20; // 20-25

                window.niceConfirm({
                    title: "Xác nhận đơn hàng",
                    message: `Hệ thống hiện đang có nhiều yêu cầu xử lý. Thời gian ước tính hoàn thành cho video của bạn là khoảng ${minWait}-${maxWait} phút. Bạn có đồng ý tiếp tục gửi yêu cầu và trừ ${model.cost} coin không?`,
                    icon: "⏳",
                    onConfirm: async () => {
                        try {
                            console.log("Confirm Clicked - Starting process");
                            // 2. Upload Files
                            showToast("⏳ Đang chuẩn bị tải file lên...");
                            submitBtn.innerText = "Đang tải file...";
                            submitBtn.disabled = true;
                            progressDiv.style.display = 'block';

                            console.log("📤 Đang tải ảnh nhân vật...");
                            const charUrl = await uploadFile(charFile, "characters");
                            showToast("✅ Đã tải xong ảnh. Đang tải video...");

                            console.log("📤 Đang tải video tham chiếu...");
                            const videoUrl = await uploadFile(videoFile, "motions");
                            showToast("✅ Đã tải xong video. Đang tạo đơn hàng...");

                            // 3. Finalize Transaction (Deduct coins and create order)
                            const orderId = await runTransaction(db, async (transaction) => {
                                const userDoc = await transaction.get(userRef);
                                const currentCoins = userDoc.data().coins;

                                const aspectRatioEl = document.querySelector('input[name="aspect-ratio"]:checked');
                                const aspectRatio = aspectRatioEl ? aspectRatioEl.value : '16:9';

                                transaction.update(userRef, { coins: currentCoins - model.cost });

                                const orderRef = doc(collection(db, "orders"));
                                transaction.set(orderRef, {
                                    userId: currentUser.uid,
                                    userEmail: currentUser.email,
                                    userName: currentUser.displayName,
                                    packageName: model.name,
                                    serviceType: serviceType,
                                    costCoins: model.cost,
                                    characterImageLink: charUrl,
                                    referenceVideoLink: videoUrl,
                                    aspectRatio: aspectRatio,
                                    status: "pending",
                                    resultLink: "",
                                    adminNote: "",
                                    createdAt: serverTimestamp(),
                                    updatedAt: serverTimestamp()
                                });
                                return orderRef.id;
                            });

                            showToast("🚀 Đơn hàng đã được tạo thành công!");
                            closeModal('order-modal');
                            document.getElementById('order-form').reset();
                            document.getElementById('preview-char-container').innerHTML = '';
                            document.getElementById('preview-video-container').innerHTML = '';
                            showDashboard();
                            const msg = `🚀 *ĐƠN HÀNG MỚI!*\n\n` +
                                        `🆔 Mã đơn: #${orderId}\n` +
                                        `👤 Khách: ${currentUser.displayName}\n` +
                                        `📧 Email: ${currentUser.email}\n` +
                                        `📦 Gói: ${model.name}\n` +
                                        `💰 Chi phí: ${model.cost} Coin\n` +
                                        `🖼 [Xem ảnh nhân vật](${charUrl})\n` +
                                        `📹 [Xem video tham chiếu](${videoUrl})`;
                            sendTelegramMessage(msg);
                        } catch (err) {
                            console.error("Order Creation Error:", err);
                            showToast("❌ Lỗi khi tạo đơn: " + (err.message || err));
                        } finally {
                            submitBtn.disabled = false;
                            submitBtn.innerText = `Thành video ngay (${model.cost} coin)`;
                            progressDiv.style.display = 'none';
                        }
                    }
                });
                return; // Wait for confirmation callback
            } catch (error) {
                console.error(error);
                if (error === "Không đủ coin!") {
                    window.niceConfirm({
                        title: "Số dư không đủ",
                        message: "Số dư của bạn không đủ để thực hiện yêu cầu này. Bạn có muốn nạp thêm Coin ngay không?",
                        icon: "💰",
                        onConfirm: () => {
                            closeModal('order-modal');
                            if (window.openPricingModal) window.openPricingModal();
                        }
                    });
                } else {
                    showToast("Lỗi: " + error);
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = `Thành video ngay (${model.cost} coin)`;
                progressDiv.style.display = 'none';
            }
        });
    }
}

// --- Data Loading (Real-time) ---
function loadMyOrders() {
    const { db, collection, query, where, onSnapshot } = window.firebase;
    const q = query(
        collection(db, "orders"), 
        where("userId", "==", currentUser.uid)
    );

    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('my-orders-list');
        if (snapshot.empty) {
            list.innerHTML = `<tr><td colspan="3" style="text-align:center; opacity: 0.5; padding: 2rem;">Chưa có đơn hàng nào.</td></tr>`;
            return;
        }

        // Sắp xếp thủ công trên client để tránh lỗi Index Firestore
        const sortedDocs = [...snapshot.docs].sort((a, b) => {
            const timeA = a.data().createdAt?.seconds || 0;
            const timeB = b.data().createdAt?.seconds || 0;
            return timeB - timeA;
        });

        list.innerHTML = sortedDocs.map(doc => {
            const d = doc.data();
            const orderId = doc.id.substring(doc.id.length - 6).toUpperCase();
            const date = d.createdAt ? d.createdAt.toDate().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '...';
            const fullDate = d.createdAt ? d.createdAt.toDate().toLocaleDateString('vi-VN') : '';
            const statusVN = STATUS_MAP[d.status] || d.status;
            
            // Kiểm tra xem đơn hàng có phải là "Mới" (trong vòng 5 phút) không
            const isNew = d.createdAt && (Date.now() - d.createdAt.toDate().getTime() < 5 * 60 * 1000);
            const rowClass = isNew ? 'new-order-highlight' : '';
            
            return `
                <tr onclick="window.openUserOrderDetail('${doc.id}')" class="${rowClass}" style="cursor: pointer;">
                    <td>
                        <div style="width: 44px; height: 44px; border-radius: 8px; overflow: hidden; border: 1px solid var(--glass-border); background: #000;">
                            <img src="${d.characterImageLink}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span style="font-family: monospace; font-weight: bold; color: var(--accent-primary); font-size: 1rem;">#${orderId}</span>
                            ${isNew ? '<span class="new-badge">MỚI</span>' : ''}
                        </div>
                        <div style="font-size: 0.75rem; opacity: 0.6; margin-top: 2px;">${date} - ${fullDate}</div>
                    </td>
                    <td>
                        <span class="status-badge status-${d.status}">${statusVN}</span>
                        ${d.resultLink ? '<div style="font-size: 0.7rem; color: #2ecc71; margin-top: 4px; font-weight: 600;">✅ Xong</div>' : ''}
                    </td>
                    <td>
                        <button class="btn-detail-view">
                            <span>🔍 Xem</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }, (error) => {
        console.error("Orders Listener Error:", error);
        // Nếu lỗi do thiếu index, in ra thông báo cho user
        if (error.code === 'failed-precondition') {
            console.warn("⚠️ Cần tạo Index cho Firestore. Hãy kiểm tra Console để nhấn vào link tạo index.");
        }
    });
}

function loadMyTopups() {
    const { db, collection, query, where, onSnapshot } = window.firebase;
    const q = query(
        collection(db, "topups"), 
        where("userId", "==", currentUser.uid)
    );

    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('my-topups-list');
        if (snapshot.empty) {
            list.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity: 0.5; padding: 2rem;">Chưa có yêu cầu nạp nào.</td></tr>`;
            return;
        }

        // Sắp xếp thủ công trên client
        const sortedDocs = [...snapshot.docs].sort((a, b) => {
            const timeA = a.data().createdAt?.seconds || 0;
            const timeB = b.data().createdAt?.seconds || 0;
            return timeB - timeA;
        });

        list.innerHTML = sortedDocs.map(doc => {
            const d = doc.data();
            const date = d.createdAt ? d.createdAt.toDate().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '...';
            const statusVN = STATUS_MAP[d.status] || d.status;
            return `
                <tr>
                    <td>${d.packageName}</td>
                    <td>${d.amount ? d.amount.toLocaleString() : 0}đ</td>
                    <td>${d.coins}</td>
                    <td><span class="status-badge status-${d.status}">${statusVN}</span></td>
                    <td>${date}</td>
                </tr>
            `;
        }).join('');
    });
}

window.viewFullImage = (url) => {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('full-res-image');
    if (!modal || !img) return;
    img.src = url;
    modal.style.display = 'flex';
};

// --- Admin Dashboard Logic ---
window.switchAdminTab = (tabName) => {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active'));

    const btn = document.querySelector(`button[onclick*="switchAdminTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');
    document.getElementById(`admin-tab-${tabName}`).classList.add('active');
};

window.makeAdmin = async () => {
    const email = document.getElementById('user-admin-email').value.trim();
    if (!email) return showToast("Vui lòng nhập email.");

    const { db, collection, query, where, getDocs, updateDoc, doc } = window.firebase;
    const q = query(collection(db, "users"), where("email", "==", email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) return showToast("Không tìm thấy người dùng này.");

    const userDoc = querySnapshot.docs[0];
    await updateDoc(doc(db, "users", userDoc.id), { role: 'admin' });
    showToast(`Đã cấp quyền Admin cho ${email}`);
    document.getElementById('user-admin-email').value = '';
};

window.approveTopup = async (topupId, userId, coins) => {
    if (!confirm(`Xác nhận duyệt nạp ${coins} Coin?`)) return;

    const { db, doc, runTransaction, serverTimestamp } = window.firebase;
    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", userId);
            const topupRef = doc(db, "topups", topupId);
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists()) throw "User không tồn tại!";

            const newCoins = (userSnap.data().coins || 0) + coins;
            transaction.update(userRef, { coins: newCoins, updatedAt: serverTimestamp() });
            transaction.update(topupRef, { status: 'approved' });
        });
        showToast("Đã duyệt thành công!");
    } catch (e) {
        console.error(e);
        showToast("Lỗi khi duyệt nạp tiền.");
    }
};

window.rejectTopup = async (topupId) => {
    if (!confirm("Từ chối yêu cầu này?")) return;
    const { db, doc, updateDoc } = window.firebase;
    try {
        await updateDoc(doc(db, "topups", topupId), { status: 'rejected' });
        showToast("Đã từ chối yêu cầu.");
    } catch (e) {
        showToast("Lỗi khi cập nhật.");
    }
};

let currentAdminOrderId = null;
window.openAdminDetail = async (orderId) => {
    currentAdminOrderId = orderId;
    const { db, doc, getDoc } = window.firebase;
    const snap = await getDoc(doc(db, "orders", orderId));
    const d = snap.data();

    const shortOrderId = snap.id.substring(snap.id.length - 6).toUpperCase();
    document.getElementById('admin-order-details').innerHTML = `
        <div class="admin-info-grid">
            <div class="info-item">
                <span class="info-label">🆔 Mã đơn hàng</span>
                <span class="info-value" style="font-family: monospace; font-weight: bold; color: var(--accent-primary);">#${shortOrderId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">👤 Khách hàng</span>
                <span class="info-value">${d.userName} (${d.userEmail})</span>
            </div>
            <div class="info-item">
                <span class="info-label">📦 Gói dịch vụ</span>
                <span class="info-value">${d.packageName}</span>
            </div>
            <div class="info-item">
                <span class="info-label">📏 Tỷ lệ khung hình</span>
                <span class="info-value">${d.aspectRatio || '16:9'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">🖼️ Ảnh nhân vật</span>
                <div class="admin-preview-box" onclick="window.viewFullImage('${d.characterImageLink}')">
                    <img src="${d.characterImageLink}">
                    <div class="preview-overlay">Phóng to</div>
                </div>
            </div>
            <div class="info-item">
                <span class="info-label">📹 Video tham chiếu</span>
                <div class="admin-preview-box" onclick="window.open('${d.referenceVideoLink}', '_blank')">
                    <video src="${d.referenceVideoLink}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>
                    <div class="preview-overlay">Xem video</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('admin-status').value = d.status;
    document.getElementById('admin-result-link').value = d.resultLink || "";
    document.getElementById('admin-note').value = d.adminNote || "";

    openModal('admin-detail-modal');
};

document.getElementById('admin-update-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { db, doc, updateDoc, serverTimestamp } = window.firebase;
    try {
        await updateDoc(doc(db, "orders", currentAdminOrderId), {
            status: document.getElementById('admin-status').value,
            resultLink: document.getElementById('admin-result-link').value,
            adminNote: document.getElementById('admin-note').value,
            updatedAt: serverTimestamp()
        });
        showToast("Cập nhật đơn hàng thành công!");
        closeModal('admin-detail-modal');
    } catch (error) {
        console.error(error);
        showToast("Lỗi cập nhật.");
    }
});

let currentTopupStatus = 'pending';
let currentOrderStatus = 'pending';

window.switchTopupSubTab = (status) => {
    currentTopupStatus = status;
    document.querySelectorAll('#admin-tab-topups .sub-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-status') === status);
    });
    loadAdminPanel();
};

window.switchOrderSubTab = (status) => {
    currentOrderStatus = status;
    document.querySelectorAll('#admin-tab-orders .sub-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-status') === status);
    });
    loadAdminPanel();
};

function loadAdminPanel() {
    console.log("Loading Admin Panel...");
    const { db, collection, query, where, onSnapshot } = window.firebase;

    // 1. Load Filtered Topups
    const qTopups = query(collection(db, "topups"), where("status", "==", currentTopupStatus));
    onSnapshot(qTopups,
        (snapshot) => {
            console.log("Topups data received:", snapshot.size);
            const list = document.getElementById('admin-topups-list');
            if (!list) return;

            if (snapshot.empty) {
                list.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:2rem;">Không có dữ liệu đơn nạp</td></tr>';
                return;
            }

            list.innerHTML = snapshot.docs.map(doc => {
                const d = doc.data();
                const safeUrl = d.proofLink ? d.proofLink.replace(/'/g, "\\'") : '';
                return `
                    <tr>
                        <td>${d.userName || 'N/A'}<br><small>${d.userEmail || ''}</small></td>
                        <td>${d.packageName || ''}<br><strong>${d.amount ? d.amount.toLocaleString() : 0}đ</strong></td>
                        <td style="color: #ffde00; font-weight: 700;">${d.transferContent || ''}</td>
                        <td>
                            <div class="proof-thumbnail" style="width: 50px; height: 50px; border-radius: 4px; overflow: hidden; border: 1px solid var(--glass-border); cursor: pointer;" onclick="window.viewFullImage('${safeUrl}')">
                                <img src="${d.proofLink}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://via.placeholder.com/50?text=Lỗi'">
                            </div>
                        </td>
                        <td>
                            ${currentTopupStatus === 'pending' ? `
                                <button class="btn-primary" style="padding: 4px 8px; font-size:0.75rem; background: #27ae60;" onclick="window.approveTopup('${doc.id}', '${d.userId}', ${d.coins})">Duyệt</button>
                                <button class="btn-secondary" style="padding: 4px 8px; font-size:0.75rem; background: #c0392b;" onclick="window.rejectTopup('${doc.id}')">Hủy</button>
                            ` : `
                                <span class="status-badge status-${d.status}">${STATUS_MAP[d.status] || d.status}</span>
                            `}
                        </td>
                    </tr>
                `;
            }).join('');
        },
        (error) => {
            console.error("Topups Snapshot Error:", error);
            showToast("Lỗi tải danh sách nạp tiền: " + error.message);
        }
    );

    // 2. Load Filtered Orders
    const qOrders = query(collection(db, "orders"), where("status", "==", currentOrderStatus));
    onSnapshot(qOrders,
        (snapshot) => {
            console.log("Orders data received:", snapshot.size);
            const list = document.getElementById('admin-orders-list');
            if (!list) return;

            if (snapshot.empty) {
                list.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:2rem;">Chưa có đơn hàng nào trong mục này</td></tr>';
                return;
            }

            list.innerHTML = snapshot.docs.map(doc => {
                const d = doc.data();
                const orderId = doc.id.substring(doc.id.length - 6).toUpperCase();
                return `
                    <tr>
                        <td style="font-family: monospace; font-weight: bold; color: var(--accent-primary);">#${orderId}</td>
                        <td>${d.userName || 'Khách'}<br><small>${d.userEmail || ''}</small></td>
                        <td>${d.packageName || ''} (${d.serviceType || ''})</td>
                        <td>${d.costCoins || 0} Coin</td>
                        <td><button class="btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="window.openAdminDetail('${doc.id}')">Cập nhật</button></td>
                    </tr>
                `;
            }).join('');
        },
        (error) => {
            console.error("Orders Snapshot Error:", error);
            showToast("Lỗi tải danh sách đơn hàng: " + error.message);
        }
    );
}

window.openUserOrderDetail = async (orderId) => {
    const { db, doc, getDoc } = window.firebase;
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) return;
    const d = snap.data();
    const shortId = snap.id.substring(snap.id.length - 6).toUpperCase();
    const statusVN = window.STATUS_MAP ? window.STATUS_MAP[d.status] : d.status;

    document.getElementById('user-order-info').innerHTML = `
        <div class="admin-info-grid">
            <div class="info-item">
                <span class="info-label">🆔 Mã đơn hàng</span>
                <span class="info-value" style="font-family: monospace; font-weight: bold; color: var(--accent-primary);">#${shortId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">✨ Trạng thái</span>
                <span class="info-value"><span class="status-badge status-${d.status}">${statusVN}</span></span>
            </div>
            <div class="info-item">
                <span class="info-label">📦 Gói dịch vụ</span>
                <span class="info-value">${d.packageName} (${d.serviceType})</span>
            </div>
            <div class="info-item">
                <span class="info-label">📏 Tỷ lệ khung hình</span>
                <span class="info-value">${d.aspectRatio || '16:9'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">🖼️ Ảnh nhân vật</span>
                <div class="admin-preview-box" onclick="event.stopPropagation(); window.viewFullImage('${d.characterImageLink}')">
                    <img src="${d.characterImageLink}">
                    <div class="preview-overlay">Phóng to</div>
                </div>
            </div>
            <div class="info-item">
                <span class="info-label">📹 Video tham chiếu</span>
                <div class="admin-preview-box" onclick="event.stopPropagation(); window.open('${d.referenceVideoLink}', '_blank')">
                    <video src="${d.referenceVideoLink}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>
                    <div class="preview-overlay">Xem gốc</div>
                </div>
            </div>
            ${(() => {
                const finalResultLink = d.resultLink;
                if (!finalResultLink) return '';
                const isWorkerLink = finalResultLink.includes('workers.dev');
                const downloadUrl = isWorkerLink ? finalResultLink + (finalResultLink.includes('?') ? '&' : '?') + 'download=1' : finalResultLink;
                return `
                <div class="info-item" style="grid-column: span 2;">
                    <span class="info-label">🎬 Kết quả video</span>
                    <a href="${downloadUrl}" target="_blank" class="btn-primary" style="display:block; text-align:center; padding: 12px; margin-top: 8px; text-decoration:none; width: 100%; font-weight: 600;">Tải Video Về Máy (7 Ngày)</a>
                    <p style="font-size: 0.75rem; color: var(--danger); margin-top: 8px; text-align: center;">⚠️ Video sẽ bị xóa vĩnh viễn khỏi máy chủ sau 7 ngày.</p>
                </div>
                `;
            })()}
            ${d.adminNote ? `
            <div class="info-item" style="grid-column: span 2;">
                <span class="info-label">💬 Ghi chú từ hệ thống</span>
                <div class="glass-card" style="padding: 1rem; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02); border-radius: 8px; color: var(--text-dim); line-height: 1.5;">
                    ${d.adminNote}
                </div>
            </div>
            ` : ''}
        </div>
    `;
    window.openModal('user-order-detail-modal');
};

window.handleAdminResultUpload = async () => {
    const fileInput = document.getElementById('admin-file-result');
    const file = fileInput.files[0];
    const statusDiv = document.getElementById('admin-upload-status');
    const btn = document.getElementById('btn-admin-upload');

    if (!file) return showToast("Vui lòng chọn file video!");

    try {
        btn.disabled = true;
        btn.innerText = "⏳ Đang tải lên...";
        statusDiv.style.display = 'block';
        statusDiv.innerText = "Bắt đầu tải video lên R2...";

        const uploadedUrl = await uploadFile(file, "results");

        document.getElementById('admin-result-link').value = uploadedUrl;
        statusDiv.innerHTML = `<span style="color: #27ae60;">✅ Tải lên thành công! Link đã được tự động điền.</span>`;
        showToast("Đã tải video lên thành công!");
    } catch (error) {
        console.error(error);
        statusDiv.innerHTML = `<span style="color: #c0392b;">❌ Lỗi: ${error.message}</span>`;
        showToast("Lỗi khi tải video lên.");
    } finally {
        btn.disabled = false;
        btn.innerText = "🚀 Tải lên Worker";
    }
};

// --- Utilities ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return alert(msg);
    toast.innerText = msg;
    toast.style.display = 'block';

    // Nếu là lỗi thì hiện lâu hơn (10 giây)
    const duration = (msg.includes('❌') || msg.includes('⚠️')) ? 10000 : 3000;

    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

function scrollToPricing() {
    document.getElementById('pricing').scrollIntoView();
}

function scrollToHow() {
    document.getElementById('how-it-works').scrollIntoView();
}

window.scrollToPricing = scrollToPricing;
window.scrollToHow = scrollToHow;

// --- Telegram Notification ---
async function sendTelegramMessage(text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: text,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error("Telegram Notify Error:", e);
    }
}
