/**
 * script.js - Core logic for MotionAI Studio
 */

const TELEGRAM_BOT_TOKEN = '8676046240:AAE14lDxAj9otGTjVnd8Smr2__Wg-J2dCLc';
const TELEGRAM_CHAT_ID = '6067707939';

// --- EmailJS Config ---
const EMAILJS_SERVICE_ID = 'service_6r6rd2q';
const EMAILJS_TEMPLATE_ID = 'template_09eir3r';
const EMAILJS_PUBLIC_KEY = '92pP97oTzMGR4p_Zp';

// --- Utility Helpers ---
function safeToDate(field) {
    if (!field) return null;
    if (typeof field.toDate === 'function') return field.toDate();
    if (typeof field === 'string') return new Date(field);
    if (field.seconds) return new Date(field.seconds * 1000);
    if (field.toMillis) return new Date(field.toMillis());
    return new Date(field);
}

// --- Firestore listener management (prevents duplicate onSnapshot leaks) ---
const FIRESTORE_UNSUBS = {
    user: null,
    myOrders: null,
    myTopups: null,
    adminTopups: null,
    adminOrders: null,
    adminUsers: null,
};

function setFirestoreUnsub(key, unsub) {
    FIRESTORE_UNSUBS[key]?.();
    FIRESTORE_UNSUBS[key] = unsub;
}

function clearAllFirestoreUnsubs() {
    Object.keys(FIRESTORE_UNSUBS).forEach((key) => {
        FIRESTORE_UNSUBS[key]?.();
        FIRESTORE_UNSUBS[key] = null;
    });
}

const USER_ORDERS_LIMIT = 50;
const USER_TOPUPS_LIMIT = 30;
const ADMIN_LIST_LIMIT = 100;

let cachedMyOrdersSnap = null;
let cachedMyTopupsSnap = null;
let cachedAdminTopupsSnap = null;
let cachedAdminOrdersSnap = null;
let cachedAdminUsersSnap = null;
let adminTopupsListenerStatus = null;
let adminOrdersListenerStatus = null;
let adminUsersListenerActive = false;
let adminSearchDebounceTimer = null;
let myOrdersFirstLoad = true;
let myTopupsFirstLoad = true;

function getAdminSearchVal() {
    return document.getElementById('admin-search-input')?.value.toLowerCase() || "";
}

function scheduleAdminPanelRerender() {
    clearTimeout(adminSearchDebounceTimer);
    adminSearchDebounceTimer = setTimeout(() => {
        renderAdminTopupsList();
        renderAdminOrdersList();
        renderAdminUsersList();
    }, 300);
}

// --- Data Constants ---
const COIN_PACKAGES = [
    { id: 'starter_v2', name: 'Starter', coins: 20, price: '40.000đ', usdPrice: '$1.99', amount: 40000, note: 'Gói giới hạn', lemonsqueezyUrl: 'https://motionaistudio.lemonsqueezy.com/checkout/buy/3f159349-cbbc-401f-b584-6c2b561b56b0' },
    { id: 'creator', name: 'Creator', coins: 100, price: '100.000đ', usdPrice: '$4.99', amount: 100000, featured: true, note: 'Tặng 50 Coin', lemonsqueezyUrl: 'https://motionaistudio.lemonsqueezy.com/checkout/buy/a3b6ba4b-ecf5-4c8a-b327-e41fa155da02' },
    { id: 'studio', name: 'Studio', coins: 550, price: '500.000đ', usdPrice: '$24.99', amount: 500000, note: 'Tặng 300 Coin', lemonsqueezyUrl: 'https://motionaistudio.lemonsqueezy.com/checkout/buy/aae30c4f-4684-483b-9177-31deb0bd33d7' },
    { id: 'pro-studio', name: 'Enterprise', coins: 1100, price: '1.000.000đ', usdPrice: '$49.99', amount: 1000000, note: 'Tặng 600 Coin', lemonsqueezyUrl: 'https://motionaistudio.lemonsqueezy.com/checkout/buy/324a1578-2352-4930-b5d9-3e086aaff17a' }
];

const AI_MODELS = [
    {
        id: 'copy-motion-photo',
        titleKey: 'models.model1_title',
        descKey: 'models.model1_desc',
        cost: 4,
        serviceType: 'motion-to-char',
        demoChar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300',
        demoRef: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/banner.mp4',
        demoResult: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/banner.mp4'
    }
];
window.AI_MODELS = AI_MODELS;


const TREND_VIDEOS = [
    { id: 't1', title: 'Nhảy vui nhộn', thumb: '', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/nha%CC%89y%20vui%20nho%CC%A3%CC%82n.mp4' },
    { id: 't5', title: 'Sexy Dance', thumb: '', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/sexy%20dance.mp4' },
    { id: 't2', title: 'Hot Trend', thumb: '', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/hot%20trend.mp4' },
    { id: 't6', title: 'Trend L S Mix', thumb: '', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/trend%20L%20S.mp4' },
    { id: 't8', title: 'What Do You Want', thumb: '', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/what%20do%20you%20want%20from%20me.mp4' },
    { id: 't9', title: 'Trend Nhạc Hay', thumb: '', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/nha%CC%A3c%20hay.mp4' }
];

const MODELS = {
    fast: { name: "Model Nhanh", cost: 10, time: "30p", modelId: "34" },
    turbo: { name: "Model Turbo 2K", cost: 20, time: "15-20p", modelId: "117" }
};

const SERVICE_PACKAGES = [
    { id: 'plus', name: 'Plus', cost: 12, features: ['Chất lượng HD', 'Ưu tiên xử lý', 'Hỗ trợ sửa đổi'], featured: true },
    { id: 'viral', name: 'Viral', cost: 25, features: ['Chất lượng 4K', 'Xử lý siêu tốc', 'Sửa đổi tối đa 3 lần'] }
];

let currentUser = null;
let selectedTopupPackage = null;
let isFirstTimeUser = false; // Flag for special offer (0 or 1 order)
let orderCount = 0; // Track total orders
let initialCoinsBeforeTopup = 0; // Để theo dõi số dư trước khi nạp
const SUPER_ADMIN_EMAILS = ["traderfinn0312@gmail.com", "dinhhoangvan.hh@gmail.com"]; // Danh sách admin khởi tạo
// --- i18n Logic ---
let currentLang = localStorage.getItem('app_lang');
if (!['vi', 'en'].includes(currentLang)) {
    currentLang = 'vi';
}
window.currentLang = currentLang;

function logFirebaseEvent(name, params = {}) {
    if (window.firebase && window.firebase.analytics && window.firebase.logEvent) {
        window.firebase.logEvent(window.firebase.analytics, name, params);
    }
}

export function t(path, params = {}) {
    const lang = (currentLang || 'vi').trim();
    if (!window.TRANSLATIONS) {
        console.warn(`window.TRANSLATIONS is missing when looking for ${path}`);
        return path;
    }
    if (!window.TRANSLATIONS[lang]) {
        console.warn(`window.TRANSLATIONS[${lang}] is missing when looking for ${path}`);
        return path;
    }
    const keys = path.split('.');
    let value = window.TRANSLATIONS[lang];
    for (const key of keys) {
        if (value && Object.prototype.hasOwnProperty.call(value, key)) {
            value = value[key];
        } else {
            console.warn(`Key ${key} missing in path ${path} for lang ${lang}`);
            value = null;
            break;
        }
    }
    if (!value) return path;
    let translated = String(value);
    Object.keys(params).forEach(key => {
        translated = translated.replace(`{${key}}`, params[key]);
    });
    return translated;
}
window.t = t;

const STATUS_MAP = () => ({
    'pending': t('status.pending'),
    'approved': t('status.approved'),
    'rejected': t('status.rejected'),
    'processing': t('status.processing'),
    'completed': t('status.completed'),
    'failed': t('status.failed'),
    'new': t('status.new'),
    'done': t('status.done')
});

const SERVICE_TYPE_MAP = () => ({
    'char-to-video': t('services.char_to_video'),
    'motion-to-char': t('services.motion_to_char')
});

window.STATUS_MAP = STATUS_MAP;
window.SERVICE_TYPE_MAP = SERVICE_TYPE_MAP;

export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
            el.value = translation;
        } else if (el.tagName === 'INPUT' && el.placeholder) {
            el.placeholder = translation;
        } else {
            el.innerHTML = translation;
        }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = t(key);
    });

    // Update current lang flag
    const flagMap = { vi: '🇻🇳', en: '🇺🇸' };
    const flagEl = document.getElementById('current-lang-flag');
    if (flagEl) flagEl.innerText = flagMap[currentLang] || '🇻🇳';

    // Render 4 Model AI grid
    if (window.renderAIModels) {
        window.renderAIModels();
    }
}

window.toggleLangMenu = (e) => {
    if (e) e.stopPropagation();
    document.getElementById('lang-menu').classList.toggle('show');
};

window.toggleNavMenu = (e) => {
    if (e) e.stopPropagation();
    document.getElementById('nav-menu').classList.toggle('show');
};

window.toggleUserMenu = (e) => {
    if (e) e.stopPropagation();
    document.getElementById('dropdown-menu').classList.toggle('show');
};

window.switchLanguage = (lang) => {
    currentLang = lang;
    window.currentLang = lang;
    localStorage.setItem('app_lang', lang);
    applyTranslations();

    // Close lang menu after switch
    const langMenu = document.getElementById('lang-menu');
    if (langMenu) langMenu.classList.remove('show');

    if (currentUser) {
        const greetingEl = document.getElementById('user-greeting');
        if (greetingEl) greetingEl.innerText = t('dashboard.greeting', { name: currentUser.displayName });
        if (cachedMyOrdersSnap) renderMyOrdersList(cachedMyOrdersSnap);
        else loadMyOrders();
        if (cachedMyTopupsSnap) renderMyTopupsList(cachedMyTopupsSnap);
        else loadMyTopups();
    }
    renderPricing();
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

    // Render public content
    renderShowcase();
    renderPricing();
    renderServicePackages();
    initPremiumEffects();
    setupEventListeners();
    syncVideos();
    // Initial UI update for first order offer
    updateFirstOrderUI();
    // Check maintenance status
    checkMaintenance();
    // Detect In-App Browsers
    detectInAppBrowser();

    // Call again after dynamic parts are rendered
    applyTranslations();
}

// --- Browser Detection ---
function detectInAppBrowser() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isTikTok = /TikTok/i.test(ua);
    const isInApp = isTikTok || /FBAV|FBAN|Messenger|Instagram|Line|WhatsApp|Telegram|MicroMessenger/i.test(ua);

    // Special logic: Hide Google Login if not Chrome/Safari or if In-App
    const isChrome = (/Chrome/i.test(ua) || /CriOS/i.test(ua)) && !/Edge|OPR|Edg|SamsungBrowser|Vivaldi|MiuiBrowser/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua) && !/SamsungBrowser|MiuiBrowser/i.test(ua);
    const isSupported = (isChrome || isSafari) && !isInApp;

    if (!isSupported) {
        const googleBtn = document.getElementById('google-login-btn');
        const googleDivider = document.querySelector('.google-auth-divider');
        const inAppNote = document.getElementById('inapp-auth-note');
        const authEmailBtn = document.getElementById('auth-email-btn');
        const authModalDesc = document.getElementById('auth-modal-desc');

        if (googleBtn) googleBtn.style.display = 'none';
        if (googleDivider) googleDivider.style.display = 'none';
        if (inAppNote) inAppNote.style.display = 'block';
        if (authEmailBtn) {
            authEmailBtn.setAttribute('data-i18n', 'modals.auth_btn_register');
            authEmailBtn.innerText = t('modals.auth_btn_register');
        }
        if (authModalDesc) {
            authModalDesc.setAttribute('data-i18n', 'modals.auth_desc_register');
            authModalDesc.innerHTML = t('modals.auth_desc_register');
        }
    }
}

// --- Premium Glow Effects ---
function initPremiumEffects() {
    // Mouse-follow Glow for Cards
    document.addEventListener('mousemove', e => {
        const cards = document.querySelectorAll('.card, .pricing-card, .wallet-card');
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });
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

// --- Video Interaction Helpers ---
window.handleVideoHover = (video, isHover) => {
    if (!video) return;

    // Detect desktop: precise pointer (mouse) OR wide screen
    const isDesktop = window.matchMedia('(pointer: fine)').matches || window.innerWidth > 1024;
    if (!isDesktop) return;

    if (isHover) {
        // Try to play with sound
        video.muted = false;
        video.volume = 1.0;
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // Autoplay policy: play muted if unmuted is blocked
                video.muted = true;
                video.play();
            });
        }
    } else {
        video.pause();
        video.muted = true;
    }
};

window.downloadUrl = (event, url) => {
    if (event) {
        event.stopPropagation();
    }
    if (!url) return;
    
    // Create a temporary link to trigger download/open
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    // The download attribute helps with same-origin, but target=_blank is the reliable fallback
    a.download = url.split('/').pop(); 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// --- Auth Functions ---
window.renderShowcase = () => {
    const gallery = document.getElementById('showcase-gallery');
    if (!gallery) return;

    gallery.innerHTML = TREND_VIDEOS.map(v => `
        <div class="showcase-card" 
             onclick="window.playOrderVideo(event, '${v.url}')"
             onmouseenter="window.handleVideoHover(this.querySelector('video'), true)" 
             onmouseleave="window.handleVideoHover(this.querySelector('video'), false)">
            <video class="showcase-video" 
                   data-src="${v.url}#t=1" 
                   muted loop playsinline preload="none">
            </video>
            <div class="showcase-play-overlay">
                <div class="play-icon-central">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
            </div>
            <div class="showcase-info">
                <div class="showcase-title">${v.title}</div>
                <button class="use-trend-btn" onclick="event.stopPropagation(); window.useTrendShortcut('${v.id}', '${v.url}')">
                    ${window.t('showcase.use_this')}
                </button>
            </div>
        </div>
    `).join('');

    // Lazy load videos when they scroll into view
    const lazyVideos = gallery.querySelectorAll('video[data-src]');
    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const video = entry.target;
                video.src = video.dataset.src;
                video.preload = 'metadata';
                delete video.dataset.src;
                videoObserver.unobserve(video);
            }
        });
    }, { rootMargin: '200px' });

    lazyVideos.forEach(v => videoObserver.observe(v));

    initPremiumEffects();
};

// Lazy loading handled by IntersectionObserver in renderShowcase

window.useTrendShortcut = (id, url) => {
    window.openOrderModal();
    window.switchVideoSource('library');
    setTimeout(() => {
        window.selectTemplate(id, url);
        const el = document.getElementById(`tpl-${id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
};

async function login() {
    const { auth, GoogleAuthProvider, signInWithPopup } = window.firebase;
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        window.focus(); // Đưa focus về lại tab hiện tại sau khi popup đóng
        showToast(t('common.toast_login_success'));
    } catch (error) {
        console.error("Login Error", error);
        window.focus(); // Đưa focus về ngay cả khi lỗi
        showToast(t('common.toast_login_failed'));
    }
}

async function logout() {
    const { auth, signOut } = window.firebase;
    try {
        await signOut(auth);
        showToast(t('common.toast_logout_success'));
    } catch (error) {
        console.error("Logout Error", error);
    }
}

// --- Email/Password Auth ---

// --- User Profile & Coin Balance ---
async function handleUserLoggedIn(user) {
    const { db, doc, getDoc, setDoc, onSnapshot, collection, query, where } = window.firebase;

    // Ẩn Auth Modal bắt buộc
    const authModal = document.getElementById('auth-modal');
    if (authModal) authModal.style.display = 'none';

    // Hiển thị Profile Menu thay vì ghi đè HTML
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('user-profile-menu').style.display = 'block';
    document.getElementById('user-avatar').src = user.photoURL || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";
    document.getElementById('dropdown-user-name').innerText = user.displayName || user.email.split('@')[0];
    document.getElementById('dropdown-user-email').innerText = user.email;

    // Hiển thị Dashboard link và Hamburger menu
    const dbItem = document.getElementById('db-dropdown-item');
    if (dbItem) dbItem.style.display = 'flex';
    const navHamburger = document.getElementById('nav-hamburger-menu');
    if (navHamburger) navHamburger.style.display = 'block';
    const topupItem = document.getElementById('topup-dropdown-item');
    if (topupItem) topupItem.style.display = 'flex';

    // Toggle Dashboard sub-elements
    const dashIn = document.getElementById('dashboard-logged-in');
    const dashOut = document.getElementById('dashboard-auth-placeholder');
    if (dashIn) dashIn.style.display = 'block';
    if (dashOut) dashOut.style.display = 'none';

    // Xử lý hành động đang chờ (ví dụ: mở modal tạo đơn sau khi login)
    if (window.pendingAction === 'openOrderModal') {
        window.pendingAction = null;
        setTimeout(() => {
            window.openOrderModal();
        }, 500);
    }

    // TikTok Pixel: Identify User for Advanced Matching
    if (typeof ttq !== 'undefined' && user.email) {
        ttq.identify({
            email: user.email
        });
        console.log("🎯 TikTok Pixel: Identified user for Advanced Matching");
    }

    // Firebase/Google Identify
    if (user.email) {
        trackAnalyticsEvent('login', { method: 'email' });
        console.log("🎯 Firebase Analytics: User identified");
    }

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // Bootstrap Super Admin from hardcoded list to Database
    const isBootstrapSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email);

    if (!userSnap.exists()) {
        const defaultName = user.displayName || user.email.split('@')[0];
        const defaultPhoto = user.photoURL || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

        await setDoc(userRef, {
            uid: user.uid,
            displayName: defaultName,
            email: user.email,
            photoURL: defaultPhoto,
            coins: 0,
            role: isBootstrapSuperAdmin ? 'super-admin' : 'user', // Tự động gán role vào DB
            createdAt: window.firebase.serverTimestamp(),
            updatedAt: window.firebase.serverTimestamp()
        });

        // Gửi thông báo Telegram khi có user mới đăng ký
        // sendTelegramMessage(`🆕 <b>USER MỚI ĐĂNG KÝ!</b>\n👤 Tên: ${escapeHTML(defaultName)}\n📧 Email: ${escapeHTML(user.email)}\n🕐 Thời gian: ${new Date().toLocaleString('vi-VN')}`);
    } else {
        // Nếu đã có user nhưng email thuộc list bootstrap mà chưa có role admin thì cập nhật
        const userData = userSnap.data();
        if (isBootstrapSuperAdmin && userData.role !== 'super-admin') {
            await window.firebase.updateDoc(userRef, { role: 'super-admin' });
        }
    }

    setFirestoreUnsub('user', onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const currentCoins = data.coins || 0;

            // Log Login Event to Firebase
            logFirebaseEvent('login', { method: 'Firebase' });

            // Tự động nhận biết nạp coin thành công
            const topupModal = document.getElementById('topup-modal');
            if (topupModal && topupModal.style.display === 'flex' && currentCoins > initialCoinsBeforeTopup) {
                showToast(t('common.toast_coins_added'));
                closeModal('topup-modal');
                // Hiệu ứng pháo hoa hoặc rung nhẹ balance
                document.querySelectorAll('.coin-balance-text').forEach(el => {
                    el.classList.add('coin-update-glow');
                    setTimeout(() => el.classList.remove('coin-update-glow'), 2000);
                });

                // Notify Telegram
                const addedCoins = currentCoins - initialCoinsBeforeTopup;

                // Firebase Analytics: Purchase Event
                trackAnalyticsEvent('purchase', {
                    transaction_id: `topup_${Date.now()}`,
                    value: selectedTopupPackage ? selectedTopupPackage.amount : addedCoins * 1000,
                    currency: 'VND',
                    items: [{
                        item_id: selectedTopupPackage ? selectedTopupPackage.id : 'coin_topup',
                        item_name: selectedTopupPackage ? selectedTopupPackage.name : 'Coin Topup'
                    }]
                });

                // TikTok Pixel: CompletePayment
                if (typeof ttq !== 'undefined') {
                    const vndValue = selectedTopupPackage ? selectedTopupPackage.amount : addedCoins * 1000;
                    const contentId = selectedTopupPackage ? selectedTopupPackage.id : 'topup';
                    ttq.track('CompletePayment', {
                        value: vndValue,
                        currency: 'VND',
                        content_id: contentId
                    });
                }

                // Firebase Analytics: Purchase
                const purchaseValue = selectedTopupPackage ? selectedTopupPackage.amount : addedCoins * 1000;
                const purchaseId = selectedTopupPackage ? selectedTopupPackage.id : 'topup';
                logFirebaseEvent('purchase', {
                    value: purchaseValue,
                    currency: 'VND',
                    transaction_id: `topup_${Date.now()}`,
                    items: [{ item_id: purchaseId, item_name: `Topup ${addedCoins} Coins` }]
                });

                sendTelegramMessage(`💰 <b>NẠP COIN THÀNH CÔNG!</b>\n👤 Khách: ${escapeHTML(data.displayName)}\n📧 Email: ${escapeHTML(data.email)}\n✨ Đã cộng: +${addedCoins} Coin\n💰 Số dư mới: ${currentCoins} Coin`);
            }

            document.querySelectorAll('.coin-balance-text').forEach(el => el.innerText = currentCoins);
            document.querySelectorAll('.user-greeting-text').forEach(el => el.innerText = t('dashboard.greeting', { name: data.displayName }));
            document.querySelectorAll('.user-email-text').forEach(el => el.innerText = data.email);

            // Check Admin Rights từ Database
            const isAdmin = data.role === 'admin' || data.role === 'super-admin';
            const isSuperAdmin = data.role === 'super-admin';

            if (isAdmin) {
                // Show Admin Panel nav links
                const adminProfileItem = document.getElementById('admin-dropdown-item-profile');
                if (adminProfileItem) adminProfileItem.style.display = 'flex';
                const adminDivider = document.getElementById('admin-dropdown-divider');
                if (adminDivider) adminDivider.style.display = 'block';
                const adminNavItem = document.getElementById('admin-dropdown-item-nav');
                if (adminNavItem) adminNavItem.style.display = 'flex';

                loadAdminPanel();
                if (isSuperAdmin) {
                    document.getElementById('tab-users').style.display = 'block';
                }
            } else {
                // Hide Admin Panel nav links
                const adminProfileItem = document.getElementById('admin-dropdown-item-profile');
                if (adminProfileItem) adminProfileItem.style.display = 'none';
                const adminDivider = document.getElementById('admin-dropdown-divider');
                if (adminDivider) adminDivider.style.display = 'none';
                const adminNavItem = document.getElementById('admin-dropdown-item-nav');
                if (adminNavItem) adminNavItem.style.display = 'none';
                
                document.getElementById('admin-panel').style.display = 'none';
            }
        }
    }));

    loadMyOrders();
    loadMyTopups();
    // Không tự chuyển về Dashboard - giữ user ở trang hiện tại (Home)
}

function handleUserLoggedOut() {
    clearAllFirestoreUnsubs();
    cachedMyOrdersSnap = null;
    cachedMyTopupsSnap = null;
    cachedAdminTopupsSnap = null;
    cachedAdminOrdersSnap = null;
    cachedAdminUsersSnap = null;
    adminTopupsListenerStatus = null;
    adminOrdersListenerStatus = null;
    adminUsersListenerActive = false;
    myOrdersFirstLoad = true;
    myTopupsFirstLoad = true;

    // Không hiện Auth Modal bắt buộc lúc đầu nữa
    const authModal = document.getElementById('auth-modal');
    if (authModal) authModal.style.display = 'none';

    document.getElementById('login-btn').style.display = 'flex';
    document.getElementById('user-profile-menu').style.display = 'none';

    const dbItem = document.getElementById('db-dropdown-item');
    if (dbItem) dbItem.style.display = 'none';
    const navHamburger = document.getElementById('nav-hamburger-menu');
    if (navHamburger) navHamburger.style.display = 'none';

    // Toggle Dashboard sub-elements
    const dashIn = document.getElementById('dashboard-logged-in');
    const dashOut = document.getElementById('dashboard-auth-placeholder');
    if (dashIn) dashIn.style.display = 'none';
    if (dashOut) dashOut.style.display = 'block';

    const topupPage = document.getElementById('topup-history-page');
    if (topupPage) topupPage.style.display = 'none';
    const topupItem = document.getElementById('topup-dropdown-item');
    if (topupItem) topupItem.style.display = 'none';
    const adminProfileItem = document.getElementById('admin-dropdown-item-profile');
    if (adminProfileItem) adminProfileItem.style.display = 'none';
    const adminDivider = document.getElementById('admin-dropdown-divider');
    if (adminDivider) adminDivider.style.display = 'none';
    const adminNavItem = document.getElementById('admin-dropdown-item-nav');
    if (adminNavItem) adminNavItem.style.display = 'none';

    isFirstTimeUser = false;
    updateFirstOrderUI();

    showLanding();
}

function showDashboard() {
    hideAllPages();
    document.getElementById('user-dashboard').style.display = 'block';
    window.scrollTo(0, 0);
}

function showTopupHistory() {
    hideAllPages();
    document.getElementById('topup-history-page').style.display = 'block';
    window.scrollTo(0, 0);
}

function showBuildChannel() {
    hideAllPages();
    document.getElementById('build-channel-page').style.display = 'block';
    window.scrollTo(0, 0);
}

function showAdminPanel() {
    hideAllPages();
    document.getElementById('admin-panel').style.display = 'block';
    window.scrollTo(0, 0);
}

function showLanding() {
    hideAllPages();
    document.getElementById('landing-page').style.display = 'block';
}

function hideAllPages() {
    const pages = ['landing-page', 'user-dashboard', 'topup-history-page', 'admin-panel', 'build-channel-page'];
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
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
    } else if (target === 'topup-history-page') {
        showTopupHistory();
    } else if (target === 'build-channel-page') {
        showBuildChannel();
    } else if (target === 'admin-panel') {
        showAdminPanel();
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

// Đóng menu khi click ra ngoài
window.addEventListener('click', () => {
    const userMenu = document.getElementById('dropdown-menu');
    if (userMenu) userMenu.classList.remove('show');
    const langMenu = document.getElementById('lang-menu');
    if (langMenu) langMenu.classList.remove('show');
    const navMenu = document.getElementById('nav-menu');
    if (navMenu) navMenu.classList.remove('show');
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

window.copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast("✅ Đã sao chép vào bộ nhớ tạm!");
    }).catch(err => {
        console.error('Lỗi khi copy:', err);
    });
};


// --- Rendering ---
function renderPricing() {
    // Render into landing page section if it exists
    const coinGrid = document.getElementById('coin-packages');
    const modalCoinGrid = document.getElementById('modal-coin-packages');

    // Filter packages based on 10k purchase count (Limit 1)
    const filteredPackages = COIN_PACKAGES;

    const html = filteredPackages.map(pkg => `
        <div class="price-card ${pkg.featured ? 'featured' : ''}">
            ${pkg.featured ? `<div class="featured-badge">🔥 ${t('pricing.featured')}</div>` : ''}
            ${pkg.note ? `<div class="bonus-tag">${pkg.note}</div>` : ''}
            
                <div class="coin-visual-wrapper" style="margin-bottom: 4px;">
                    <svg class="coin-icon-svg" style="width: 28px; height: 28px;" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" fill="url(#coin-gradient)" fill-opacity="0.2" stroke="url(#coin-gradient)" stroke-width="2"/>
                        <path d="M12 6L17.2 9V15L12 18L6.8 15V9L12 6Z" fill="url(#coin-gradient)"/>
                        <path d="M12 9V15M9 12H15" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span>${pkg.coins}</span>
                </div>
                ${pkg.note && pkg.note.includes('Tặng') ? `<div style="font-size: 0.75rem; color: #a0a0a0; margin-bottom: 10px; font-weight: 500;">(Đã bao gồm số lượng tặng)</div>` : `<div style="height: 22px; margin-bottom: 10px;"></div>`}

            <div class="price-value">${pkg.price}</div>
            
            <ul class="pkg-features">
                <li><span class="check-icon">✓</span> ${t('pricing.instant_credit')}</li>
                <li><span class="check-icon">✓</span> ${t('pricing.high_quality')}</li>
                <li><span class="check-icon">✓</span> ${t('pricing.no_expiry')}</li>
            </ul>

            <button class="btn-primary" onclick="window.selectTopup('${pkg.id}')" style="width: 100%; margin-top: auto;">
                ${t('pricing.buy_now')}
            </button>
        </div>
    `).join('');

    if (coinGrid) coinGrid.innerHTML = html;
    if (modalCoinGrid) modalCoinGrid.innerHTML = html;
}

function renderServicePackages() {
    const grid = document.getElementById('service-packages');
    if (!grid) return;

    grid.innerHTML = SERVICE_PACKAGES.map(pkg => `
        <div class="price-card ${pkg.featured ? 'featured' : ''}">
            ${pkg.featured ? `<div class="featured-badge">🔥 Hot</div>` : ''}
            <h3>${pkg.name}</h3>
            <div class="coin-visual-wrapper">
                <svg class="coin-icon-svg" style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" fill="url(#coin-gradient)" fill-opacity="0.2" stroke="url(#coin-gradient)" stroke-width="2"/>
                    <path d="M12 6L17.2 9V15L12 18L6.8 15V9L12 6Z" fill="url(#coin-gradient)"/>
                    <path d="M12 9V15M9 12H15" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span>${pkg.cost} Coin</span>
            </div>
            <ul class="pkg-features">
                ${pkg.features.map(f => `<li><span class="check-icon">✓</span> ${f}</li>`).join('')}
            </ul>
            <button class="btn-primary" onclick="window.openOrderModal()" style="width: 100%; margin-top: auto;">
                Bắt đầu ngay
            </button>
        </div>
    `).join('');
}

// --- Video Library ---
// --- Video Library ---
window.switchVideoSource = (type) => {
    const uploadBtn = document.getElementById('tab-upload');
    const libraryBtn = document.getElementById('tab-library');
    const uploadSection = document.getElementById('video-upload-section');
    const librarySection = document.getElementById('video-library-section');

    if (type === 'upload') {
        uploadBtn.classList.add('active');
        libraryBtn.classList.remove('active');
        uploadSection.style.display = 'block';
        librarySection.style.display = 'none';
        window.currentVideoSource = 'upload';
    } else {
        uploadBtn.classList.remove('active');
        libraryBtn.classList.add('active');
        uploadSection.style.display = 'none';
        librarySection.style.display = 'block';
        window.currentVideoSource = 'library';
        renderTemplates();
    }
};

window.renderTemplates = () => {
    const grid = document.getElementById('template-library-grid');
    if (!grid) return;
    grid.innerHTML = TREND_VIDEOS.map(t => `
        <div class="template-item" id="tpl-${t.id}" 
             onclick="window.previewTemplate('${t.id}')"
             onmouseenter="window.handleVideoHover(this.querySelector('video'), true)" 
             onmouseleave="window.handleVideoHover(this.querySelector('video'), false)">
            <video class="template-video" src="${t.url}#t=1" poster="${t.thumb}" muted loop playsinline preload="metadata"></video>
            <div class="template-overlay">${t.title}</div>
        </div>
    `).join('');
};

window.previewTemplate = (id) => {
    const template = TREND_VIDEOS.find(t => t.id === id);
    if (!template) return;

    const modal = document.getElementById('template-preview-modal');
    const video = document.getElementById('template-preview-video');
    const nameText = document.getElementById('template-preview-name');
    const confirmBtn = document.getElementById('template-confirm-btn');

    if (modal && video) {
        video.src = template.url;
        nameText.innerText = template.title;
        modal.style.display = 'flex';
        video.play();

        confirmBtn.onclick = () => {
            window.selectTemplate(template.id, template.url);
            window.closeTemplatePreview();
        };
    }
};

window.closeTemplatePreview = () => {
    const modal = document.getElementById('template-preview-modal');
    const video = document.getElementById('template-preview-video');
    if (modal && video) {
        video.pause();
        video.src = '';
        modal.style.display = 'none';
    }
};

window.selectTemplate = (id, url) => {
    document.querySelectorAll('.template-item').forEach(el => el.classList.remove('active'));
    const item = document.getElementById(`tpl-${id}`);
    if (item) item.classList.add('active');
    document.getElementById('selected-template-url').value = url;
    window.currentVideoSource = 'library';
    const trend = TREND_VIDEOS.find(t => t.id === id);
    showToast("✅ Đã chọn trend: " + (trend ? trend.title : id));
};

window.currentVideoSource = 'upload';

// --- Modals ---
window.playOrderVideo = (event, videoUrl) => {
    if (event) event.stopPropagation();
    const modal = document.getElementById('video-viewer-modal');
    const video = document.getElementById('full-res-video');
    if (modal && video) {
        video.src = videoUrl;
        modal.style.display = 'flex';
        video.play();
    }
};

window.closeVideoModal = () => {
    const modal = document.getElementById('video-viewer-modal');
    const video = document.getElementById('full-res-video');
    if (modal && video) {
        video.pause();
        video.src = '';
        modal.style.display = 'none';
    }
};

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
    
    // TikTok Pixel: ViewContent (Viewing Topup Packages)
    if (typeof ttq !== 'undefined') {
        ttq.track('ViewContent', {
            content_name: 'Topup Packages',
            content_type: 'product_group',
            content_id: 'all_packages'
        });
    }

    // Firebase Analytics: view_item_list
    logFirebaseEvent('view_item_list', { item_list_name: 'Topup Packages' });
};

window.selectTopup = async (id) => {
    if (!currentUser) return login();



    selectedTopupPackage = COIN_PACKAGES.find(p => p.id === id);

    // Lưu số dư hiện tại để theo dõi biến động khi nạp
    initialCoinsBeforeTopup = parseInt(document.getElementById('coin-balance').innerText) || 0;

    // Close pricing modal if open
    closeModal('pricing-modal');

    // Reset payment tab to vietqr
    setTimeout(() => {
        if (window.switchPaymentTab) {
            window.switchPaymentTab('vietqr');
        }
    }, 100);

    // TikTok Pixel: InitiateCheckout
    if (typeof ttq !== 'undefined') {
        ttq.track('InitiateCheckout', {
            value: selectedTopupPackage.amount,
            currency: 'VND',
            content_id: selectedTopupPackage.id
        });
    }

    // Firebase Analytics: begin_checkout
    logFirebaseEvent('begin_checkout', {
        value: selectedTopupPackage.amount,
        currency: 'VND',
        items: [{ item_id: selectedTopupPackage.id, item_name: selectedTopupPackage.name }]
    });

    // --- Tự động tạo bản ghi nạp tiền để Webhook Casso có thể tìm thấy ---
    const { db, collection, addDoc, serverTimestamp, query, where, getDocs } = window.firebase;
    let transferContent = "";
    
    try {
        // [FIX]: Kiểm tra xem user đã có đơn pending nào cho gói này chưa
        const q = query(
            collection(db, "topups"),
            where("userId", "==", currentUser.uid),
            where("status", "==", "pending"),
            where("packageName", "==", selectedTopupPackage.name)
        );
        
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            // Tái sử dụng đơn nạp cũ
            const existingDoc = snapshot.docs[0].data();
            transferContent = existingDoc.transferContent;
            console.log("♻️ Tái sử dụng đơn nạp tiền cũ đang chờ:", transferContent);
        } else {
            // Tạo mã nạp mới
            const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
            transferContent = `${selectedTopupPackage.coins} COIN ${randomStr}`;
            
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
                isAutomated: true
            });
            console.log("📝 Đã tạo bản ghi nạp tiền mới:", transferContent);
        }
    } catch (err) {
        console.error("Lỗi khi kiểm tra/tạo bản ghi nạp tiền:", err);
        // Fallback tạo mã offline nếu lỗi
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        transferContent = `${selectedTopupPackage.coins} COIN ${randomStr}`;
    }

    document.getElementById('topup-package-info').innerHTML = `
        <div class="topup-info-card">
            <div class="topup-info-main">
                <div class="coin-visual-wrapper">
                    <svg class="coin-icon-svg premium-coin" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" fill="url(#coin-gradient)" fill-opacity="0.2" stroke="url(#coin-gradient)" stroke-width="2"/>
                        <path d="M12 6L17.2 9V15L12 18L6.8 15V9L12 6Z" fill="url(#coin-gradient)"/>
                        <path d="M12 9V15M9 12H15" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="package-details">
                    <div class="pkg-label">${t('dashboard.col_package')}</div>
                    <div class="pkg-name">${selectedTopupPackage.name}</div>
                    <div class="pkg-coins">+${selectedTopupPackage.coins} Coins</div>
                </div>
            </div>
            <div class="topup-info-price">
                <div class="price-label">${t('dashboard.col_amount')}</div>
                <div class="price-val">${selectedTopupPackage.price}</div>
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
        document.getElementById('btn-save-qr').style.display = 'block';
    };

    // Generate VietQR Link
    const amount = selectedTopupPackage.amount;
    const bankId = "OCB"; // OCB Bank
    const accNo = "CASS0965951536";
    const accName = "VAN DINH HOANG";
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(accName)}`;

    qrImg.src = qrUrl;

    window.openModal('topup-modal');
};

window.openOrderModal = () => {
    // Thông báo click nút tạo video về Telegram
    // const clickMsg = `🎯 <b>NÚT TẠO VIDEO VỪA ĐƯỢC BẤM! (TRANG CHỦ)</b>\n👤 Trạng thái: ${currentUser ? 'Đã đăng nhập' : 'Khách vãng lai'}\n📧 Email: ${currentUser ? escapeHTML(currentUser.email) : 'N/A'}\n🕐 Thời gian: ${new Date().toLocaleString('vi-VN')}`;
    // sendTelegramMessage(clickMsg);

    updateFirstOrderUI();
    window.openModal('order-modal');

    // TikTok Pixel: ViewContent (Viewing AI Service)
    if (typeof ttq !== 'undefined') {
        ttq.track('ViewContent', {
            content_name: 'AI Video Service',
            content_type: 'product',
            content_id: 'ai_video_generation'
        });
    }
};

function updateFirstOrderUI() {
    const costEl = document.getElementById('submit-cost');
    const offerBanner = document.getElementById('first-order-offer-banner');
    const guestOfferBar = document.getElementById('guest-offer-bar');
    
    const showOffer = (!currentUser || isFirstTimeUser) && !sessionStorage.getItem('offer_bar_dismissed');
    console.log("🎁 updateFirstOrderUI: showOffer =", showOffer, "(isFirstTimeUser:", isFirstTimeUser, ")");
    
    if (offerBanner) offerBanner.style.display = isFirstTimeUser ? 'block' : 'none';
    if (guestOfferBar) guestOfferBar.style.display = showOffer ? 'block' : 'none';
    
    const modelGroupEl = document.getElementById('model-selection-group');
    if (modelGroupEl) {
        modelGroupEl.style.display = isFirstTimeUser ? 'none' : 'block';
    }

    if (costEl) {
        const submitBtn = document.getElementById('order-submit-btn');
        const submitText = submitBtn ? submitBtn.querySelector('[data-i18n="hero.cta_create"]') : null;
        const summaryEl = document.getElementById('submit-summary-line');
        const checkedModel = document.querySelector('input[name="model-type"]:checked');
        const modelKey = checkedModel ? checkedModel.value : 'fast';

        if (orderCount === 0) {
            // First order: 1 Coin
            costEl.innerText = '1';
            if (submitBtn) submitBtn.classList.add('btn-first-offer');
            if (submitText) submitText.innerText = "Trải nghiệm ngay chỉ 1.000đ";
            if (summaryEl) {
                summaryEl.innerText = t(`modals.model_${modelKey}_desc`);
                summaryEl.style.color = '';
            }
        } else {
            // Regular pricing
            if (MODELS[modelKey]) {
                costEl.innerText = MODELS[modelKey].cost;
            }
            if (submitBtn) submitBtn.classList.remove('btn-first-offer');
            if (submitText) submitText.innerText = t('hero.cta_create');
            if (summaryEl) {
                summaryEl.innerText = t(`modals.model_${modelKey}_desc`);
                summaryEl.style.color = '';
            }
        }
    }
}

window.closeOfferBar = () => {
    const bar = document.getElementById('guest-offer-bar');
    if (bar) bar.style.display = 'none';
    sessionStorage.setItem('offer_bar_dismissed', 'true');
};

window.niceConfirm = ({ title, message, icon, onConfirm }) => {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerHTML = message; // Changed to innerHTML to support <br> and <i>
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
        if (file.size > 90 * 1024 * 1024) {
            showToast(t('modals.video_size_limit'));
            input.value = '';
            return;
        }
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            const duration = video.duration;
            if (duration > 20) {
                showToast(t('modals.video_duration_limit'));
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
            updateFirstOrderUI();
        });
    });

    // Topup Form removed for automated flow
    // (Admin updates coins in Firestore -> Real-time listener detects change -> UI auto-closes)

    // Order Form (Updated for File Upload & New Pricing)
    const orderForm = document.getElementById('order-form');
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!currentUser) {
                // Nếu chưa đăng nhập thì hiện Auth Modal
                const authModal = document.getElementById('auth-modal');
                if (authModal) authModal.style.display = 'flex';
                showToast("🔑 Vui lòng đăng ký/đăng nhập để tiếp tục!");
                return;
            }

            const { db, doc, collection, runTransaction, serverTimestamp } = window.firebase;
            const submitBtn = document.getElementById('order-submit-btn');
            const progressDiv = document.getElementById('upload-progress');

            try {
                const charFile = document.getElementById('file-char').files[0];
                const videoFile = document.getElementById('file-video').files[0];
                const templateUrl = document.getElementById('selected-template-url').value;

                if (!charFile) return showToast(t('modals.char_placeholder'));
                if (window.currentVideoSource === 'upload' && !videoFile) return showToast(t('modals.video_placeholder'));
                if (window.currentVideoSource === 'library' && !templateUrl) return showToast(t('modals.video_placeholder'));

                // Kiểm tra lại lần cuối trước khi upload
                if (charFile.size > 10 * 1024 * 1024) return showToast(t('modals.char_note'));
                if (window.currentVideoSource === 'upload' && videoFile && videoFile.size > 90 * 1024 * 1024) {
                    return showToast(t('modals.video_size_limit'));
                }

                // Show loading
                submitBtn.disabled = true;
                const mainTextInitial = submitBtn.querySelector('[data-i18n="hero.cta_create"]');
                if (mainTextInitial) mainTextInitial.innerText = t('common.loading');
                progressDiv.style.display = 'block';

                // 1. Check coins first (Transaction)
                const userRef = doc(db, "users", currentUser.uid);
                const userSnap = await runTransaction(db, async (transaction) => {
                    const userDoc = await transaction.get(userRef);
                    const modelKey = document.querySelector('input[name="model-type"]:checked').value;
                    const serviceType = document.querySelector('input[name="service-type"]:checked').value;
                    let model = { ...MODELS[modelKey] };

                    // Apply First Order Offer: 1 Coin
                    if (orderCount === 0) {
                        model.cost = 1;
                        console.log("🎁 Áp dụng ưu đãi 1 Coin cho đơn hàng đầu tiên!");
                    }

                    if (userDoc.data().coins < model.cost) {
                        throw t('modals.insufficient_coins_title');
                    }
                    return { currentCoins: userDoc.data().coins, model, serviceType };
                });

                const { model, serviceType } = userSnap;

                // 1b. Show Queue/Wait Time Confirmation
                const minWait = Math.floor(Math.random() * (15 - 10 + 1)) + 10; // 10-15
                const maxWait = Math.floor(Math.random() * (25 - 20 + 1)) + 20; // 20-25

                window.niceConfirm({
                    title: t('modals.confirm_order_title'),
                    message: t('modals.confirm_order_msg', { min: minWait, max: maxWait, cost: model.cost }),
                    icon: "⏳",
                    onConfirm: async () => {
                        try {
                            console.log("Confirm Clicked - Starting process");
                            // 2. Upload Files
                            showToast(t('common.loading'));
                            
                            const mainText = submitBtn.querySelector('[data-i18n="hero.cta_create"]');
                            if (mainText) mainText.innerText = t('modals.uploading');
                            
                            submitBtn.disabled = true;
                            progressDiv.style.display = 'block';

                            console.log("📤 Đang tải ảnh nhân vật...");
                            const charUrl = await uploadFile(charFile, "characters");
                            showToast(t('common.success'));

                            let videoUrl = "";
                            if (window.currentVideoSource === 'library') {
                                videoUrl = document.getElementById('selected-template-url').value;
                                if (!videoUrl) throw new Error("Vui lòng chọn 1 mẫu từ thư viện.");
                                console.log("🔗 Sử dụng video mẫu từ thư viện:", videoUrl);
                            } else {
                                console.log("📤 Đang tải video tham chiếu...");
                                videoUrl = await uploadFile(videoFile, "motions");
                                showToast(t('common.success'));
                            }

                            // 3. Finalize Transaction (Deduct coins and create order)
                            const orderId = await runTransaction(db, async (transaction) => {
                                const userDoc = await transaction.get(userRef);
                                const currentCoins = userDoc.data().coins;

                                const aspectRatioEl = document.querySelector('input[name="aspect-ratio"]:checked');
                                const aspectRatio = aspectRatioEl ? aspectRatioEl.value : '16:9';

                                if (model.cost > 0) {
                                    transaction.update(userRef, { coins: currentCoins - model.cost });
                                }

                                const orderRef = doc(collection(db, "orders"));
                                transaction.set(orderRef, {
                                    userId: currentUser.uid,
                                    userEmail: currentUser.email,
                                    userName: currentUser.displayName,
                                    packageName: model.name,
                                    modelId: model.modelId,
                                    serviceType: serviceType,
                                    serviceLabel: SERVICE_TYPE_MAP()[serviceType] || serviceType,
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

                            showToast(t('common.toast_order_created'));
                            closeModal('order-modal');
                            
                            const serviceLabelPixel = SERVICE_TYPE_MAP()[serviceType] || serviceType;
                            // TikTok Pixel: PlaceAnOrder
                            if (typeof ttq !== 'undefined') {
                                ttq.track('PlaceAnOrder', {
                                    value: model.cost * 1000,
                                    currency: 'VND',
                                    content_name: serviceLabelPixel,
                                    content_id: orderId
                                });
                            }

                            // Firebase Analytics: generate_lead
                            logFirebaseEvent('generate_lead', {
                                value: model.cost * 1000,
                                currency: 'VND',
                                content_name: serviceLabelPixel
                            });

                            // Update order state for immediate UI feedback
                            orderCount++;
                            isFirstTimeUser = orderCount < 2;
                            updateFirstOrderUI();

                            document.getElementById('order-form').reset();
                            document.getElementById('preview-char-container').innerHTML = '';
                            document.getElementById('preview-video-container').innerHTML = '';
                            showDashboard();
                            const serviceLabel = SERVICE_TYPE_MAP()[serviceType] || serviceType;
                            const msg = `🚀 <b>ĐƠN HÀNG MỚI: ${serviceLabel.toUpperCase()}</b>\n\n` +
                                `🆔 Mã đơn: #${orderId}\n` +
                                `👤 Khách: ${escapeHTML(currentUser.displayName)}\n` +
                                `📧 Email: ${escapeHTML(currentUser.email)}\n` +
                                `🔧 Dịch vụ: <b>${serviceLabel}</b>\n` +
                                `📦 Gói: ${model.name}\n` +
                                `💰 Chi phí: ${model.cost} Coin\n` +
                                `🖼 <a href="${charUrl}">Xem ảnh nhân vật</a>\n` +
                                `📹 <a href="${videoUrl}">Xem video tham chiếu</a>`;
                            sendTelegramMessage(msg);
                        } catch (err) {
                            console.error("Order Creation Error:", err);
                            showToast(t('common.error') + ": " + (err.message || err));
                        } finally {
                            submitBtn.disabled = false;
                            const mainText = submitBtn.querySelector('[data-i18n="hero.cta_create"]');
                            if (mainText) mainText.innerText = t('hero.cta_create');
                            updateFirstOrderUI();
                            progressDiv.style.display = 'none';
                        }
                    }
                });
                return; // Wait for confirmation callback
            } catch (error) {
                console.error(error);
                if (error === t('modals.insufficient_coins_title')) {
                    window.niceConfirm({
                        title: t('modals.insufficient_coins_title'),
                        message: t('modals.insufficient_coins_msg'),
                        icon: "💰",
                        onConfirm: () => {
                            closeModal('order-modal');
                            if (window.openPricingModal) window.openPricingModal();
                        }
                    });
                } else {
                    showToast(t('common.error') + ": " + error);
                }
            } finally {
                submitBtn.disabled = false;
                const mainTextOuter = submitBtn.querySelector('[data-i18n="hero.cta_create"]');
                if (mainTextOuter) mainTextOuter.innerText = t('hero.cta_create');
                updateFirstOrderUI();
                progressDiv.style.display = 'none';
            }
        });
    }
}

// --- Data Loading (Real-time) ---
function renderMyOrdersList(snapshot) {
    const grid = document.getElementById('my-orders-grid');
    const countText = document.getElementById('orders-count-text');
    if (!grid) return;

        // Detect changes for notifications
        if (!myOrdersFirstLoad) {
            snapshot.docChanges().forEach(change => {
                if (change.type === "modified") {
                    const data = change.doc.data();
                    const oldData = snapshot.docs.find(d => d.id === change.doc.id)?.data(); // This is not reliable, use a different way
                    // Actually docChanges() only gives us the NEW data. 
                    // To be sure it's a status change, we could compare or just notify on any mod.
                    const orderId = change.doc.id.substring(change.doc.id.length - 6).toUpperCase();
                    const statusVN = STATUS_MAP()[data.status] || data.status;

                    if (data.status === 'completed') {
                        showToast(`🎉 Đơn hàng #${orderId} đã hoàn thành!`);
                        // Optional: play sound
                    } else {
                        showToast(`ℹ️ Đơn hàng #${orderId} chuyển sang: ${statusVN}`);
                    }
                }
            });
        }
        myOrdersFirstLoad = false;

        isFirstTimeUser = snapshot.size === 0;
        orderCount = snapshot.size;
        console.log("🔍 loadMyOrders: orderCount =", orderCount, "=> isFirstTimeUser =", isFirstTimeUser);
        updateFirstOrderUI();

        if (snapshot.empty) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; opacity: 0.5; padding: 4rem 2rem; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed var(--glass-border);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🎬</div>
                <div>${t('status.no_orders')}</div>
            </div>`;
            if (countText) countText.innerText = '';
            return;
        }

        // Manual sort by time
        const sortedDocs = [...snapshot.docs].sort((a, b) => {
            const timeA = a.data().createdAt?.seconds || 0;
            const timeB = b.data().createdAt?.seconds || 0;
            return timeB - timeA;
        });

        if (countText) countText.innerText = `${sortedDocs.length} Videos`;

        grid.innerHTML = sortedDocs.map(doc => {
            const d = doc.data();
            const orderId = doc.id.substring(doc.id.length - 6).toUpperCase();
            const createdDateObj = safeToDate(d.createdAt);
            const date = createdDateObj ? createdDateObj.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '...';
            const statusVN = STATUS_MAP()[d.status] || d.status;
            const isNew = createdDateObj && (Date.now() - createdDateObj.getTime() < 5 * 60 * 1000);
            const isCompleted = d.status === 'completed' || d.status === 'done';
            const finalResultLink = d.resultLink;
            const isWorkerLink = finalResultLink && finalResultLink.includes('workers.dev');
            const downloadUrl = (isCompleted && finalResultLink) 
                ? (isWorkerLink ? finalResultLink + (finalResultLink.includes('?') ? '&' : '?') + 'download=1' : finalResultLink) 
                : '';

            const isPendingLong = d.status === 'pending' && createdDateObj && (Date.now() - createdDateObj.getTime() > 10 * 60 * 1000);
            const delayNote = isPendingLong ? `<div class="order-delay-note">${t('dashboard.delay_note')}</div>` : '';

            return `
                <div class="order-card ${isNew ? 'new-order-highlight' : ''}" onclick="${isCompleted && d.resultLink ? `window.playOrderVideo(event, '${d.resultLink}')` : `window.openUserOrderDetail('${doc.id}')`}">
                    <div class="order-thumb-wrapper">
                        <img src="${d.characterImageLink}" class="order-thumb">
                        
                        ${isCompleted && d.resultLink ? `
                            <div class="play-button-overlay">
                                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                        ` : ''}

                        <div class="order-status-overlay">
                            <span class="status-badge status-${d.status}">${statusVN}</span>
                        </div>
                        ${isNew ? '<span class="new-badge-float">NEW</span>' : ''}
                    </div>
                    <div class="order-info">
                        <div class="order-id-row">
                            <span class="order-id-text">#${orderId}</span>
                            <span class="order-date-text">${date}</span>
                        </div>
                        <div class="order-type-text">${d.serviceLabel || ''}</div>
                        ${delayNote}
                        ${(d.systemNote || d.adminNote) ? `<div class="order-system-note">💬 ${d.systemNote || d.adminNote}</div>` : ''}
                        <div class="order-footer">
                            <div class="order-cost-tag">
                                <svg style="width: 12px; height: 12px;" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" fill="url(#coin-gradient)" fill-opacity="0.2" stroke="url(#coin-gradient)" stroke-width="2"/>
                                    <path d="M12 6L17.2 9V15L12 18L6.8 15V9L12 6Z" fill="url(#coin-gradient)"/>
                                </svg>
                                <span>${d.costCoins}</span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${isCompleted && finalResultLink ? `
                                    <a class="order-download-btn" href="${downloadUrl}" download="motionai_video_${orderId}.mp4" target="_blank" onclick="event.stopPropagation();">
                                        📥 Tải về
                                    </a>
                                ` : ''}
                                <button class="order-view-btn" onclick="event.stopPropagation(); window.openUserOrderDetail('${doc.id}')">${t('dashboard.action_view_details')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
}

function loadMyOrders() {
    if (!currentUser) return;
    const { db, collection, query, where, onSnapshot, orderBy, limit } = window.firebase;
    const q = query(
        collection(db, "orders"),
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc"),
        limit(USER_ORDERS_LIMIT)
    );

    const grid = document.getElementById('my-orders-grid');
    if (grid) {
        grid.innerHTML = Array(4).fill(0).map(() => `
            <div class="order-card skeleton-card">
                <div class="skeleton" style="width:100%; aspect-ratio: 16/9; border-radius:12px;"></div>
                <div style="padding: 1rem;">
                    <div class="skeleton" style="width:60%; height:16px; margin-bottom:8px;"></div>
                    <div class="skeleton" style="width:40%; height:12px;"></div>
                </div>
            </div>
        `).join('');
    }

    setFirestoreUnsub('myOrders', onSnapshot(q, (snapshot) => {
        cachedMyOrdersSnap = snapshot;
        renderMyOrdersList(snapshot);
    }));
}

function renderMyTopupsList(snapshot) {
    const list = document.getElementById('my-topups-list');
    if (!list) return;

        // Detect changes for notifications
        if (!myTopupsFirstLoad) {
            snapshot.docChanges().forEach(change => {
                if (change.type === "modified") {
                    const data = change.doc.data();
                    const statusVN = STATUS_MAP()[data.status] || data.status;

                    if (data.status === 'approved') {
                        showToast(`✨ Đơn nạp ${data.packageName} đã được DUYỆT!`);
                    } else if (data.status === 'rejected') {
                        showToast(`❌ Đơn nạp ${data.packageName} đã bị TỪ CHỐI.`);
                    }
                }
            });
        }
        myTopupsFirstLoad = false;
        if (snapshot.empty) {
            list.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity: 0.5; padding: 2rem;">${t('status.no_topups')}</td></tr>`;
            return;
        }

        // Sắp xếp thủ công trên client
        const sortedDocs = [...snapshot.docs].sort((a, b) => {
            const dateA = safeToDate(a.data().createdAt);
            const dateB = safeToDate(b.data().createdAt);
            const timeA = dateA ? dateA.getTime() : 0;
            const timeB = dateB ? dateB.getTime() : 0;
            return timeB - timeA;
        });

        list.innerHTML = sortedDocs.map(doc => {
            const d = doc.data();
            const createdDateObj = safeToDate(d.createdAt);
            const date = createdDateObj ? createdDateObj.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '...';
            const statusVN = STATUS_MAP()[d.status] || d.status;
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
}

function loadMyTopups() {
    if (!currentUser) return;
    const { db, collection, query, where, onSnapshot, orderBy, limit } = window.firebase;
    const q = query(
        collection(db, "topups"),
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "desc"),
        limit(USER_TOPUPS_LIMIT)
    );
    const list = document.getElementById('my-topups-list');
    if (list) {
        list.innerHTML = Array(3).fill(0).map(() => `
            <tr>
                <td><div class="skeleton" style="width:100px; height:16px;"></div></td>
                <td><div class="skeleton" style="width:60px; height:16px;"></div></td>
                <td><div class="skeleton" style="width:40px; height:16px;"></div></td>
                <td><div class="skeleton" style="width:80px; height:20px; border-radius:10px;"></div></td>
                <td><div class="skeleton" style="width:100px; height:12px;"></div></td>
            </tr>
        `).join('');
    }

    setFirestoreUnsub('myTopups', onSnapshot(q, (snapshot) => {
        cachedMyTopupsSnap = snapshot;
        renderMyTopupsList(snapshot);
    }));
}

window.saveQRImage = () => {
    const qrImg = document.getElementById('qr-code-img');
    if (!qrImg || !qrImg.src) return;

    // Create a temporary link
    const a = document.createElement('a');
    a.href = qrImg.src;
    a.download = `MotionAI_QR_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("📸 Đã lưu mã QR! Hãy vào App ngân hàng chọn 'Quét mã QR' -> 'Chọn ảnh từ thư viện' nhé.");
};

window.saveQRImage = window.saveQRImage;

window.viewFullImage = (url) => {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('full-res-image');
    if (!modal || !img) return;
    img.src = url;
    modal.style.display = 'flex';
};

function checkMaintenance() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const totalMinutes = hour * 60 + minute;

    // Maintenance from 00:30 to 07:00
    const maintenanceStart = 0 * 60 + 30; // 00:30
    const maintenanceEnd = 7 * 60; // 07:00

    const isMaintenance = totalMinutes >= maintenanceStart && totalMinutes < maintenanceEnd;

    const banner = document.getElementById('maintenance-banner');
    if (banner) {
        banner.style.display = isMaintenance ? 'flex' : 'none';
    }
}

// Check every minute
setInterval(checkMaintenance, 60000);

// --- Admin Dashboard Logic ---
window.switchAdminTab = (tabName) => {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active'));

    const btn = document.querySelector(`button[onclick*="switchAdminTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');
    document.getElementById(`admin-tab-${tabName}`).classList.add('active');

    if (tabName === 'users') {
        window.loadAdminUsers();
    }
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

function renderAdminUsersList() {
    const list = document.getElementById('admin-users-list');
    if (!list || !cachedAdminUsersSnap) return;

    const searchVal = getAdminSearchVal();
    const filteredDocs = cachedAdminUsersSnap.docs.filter(doc => {
            const d = doc.data();
            const text = `${d.displayName} ${d.email}`.toLowerCase();
            return text.includes(searchVal);
        });

        // --- Client-side Pagination for Users ---
        const ITEMS_PER_PAGE = 10;
        if (!window.currentAdminUserPage) window.currentAdminUserPage = 1;
        const totalPages = Math.ceil(filteredDocs.length / ITEMS_PER_PAGE);
        
        if (window.currentAdminUserPage > totalPages && totalPages > 0) {
            window.currentAdminUserPage = totalPages;
        }

        const startIndex = (window.currentAdminUserPage - 1) * ITEMS_PER_PAGE;
        const pageData = filteredDocs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        list.innerHTML = pageData.map(doc => {
            const d = doc.data();
            return `
                <tr>
                    <td>
                        <div style="font-weight:600;">${escapeHTML(d.displayName || 'Khách')}</div>
                        <div style="font-size:0.75rem; opacity:0.6;">${escapeHTML(d.email || '')}</div>
                    </td>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="number" value="${d.coins || 0}" 
                                   style="width: 80px; padding: 4px 8px; border-radius:4px; background:rgba(255,255,255,0.05); border:1px solid var(--glass-border); color:white;"
                                   id="user-coins-${doc.id}">
                            <button class="btn-primary" style="padding: 4px 8px; font-size:0.75rem;" 
                                    onclick="window.updateUserCoins('${doc.id}')">Lưu</button>
                        </div>
                    </td>
                    <td><span class="status-badge" style="background: ${d.role === 'admin' ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}">${d.role || 'user'}</span></td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            <button class="btn-secondary" style="padding: 4px 8px; font-size:0.75rem; white-space:nowrap;" onclick="window.makeAdminDirect('${doc.id}', '${d.role}')">
                                ${d.role === 'admin' ? 'Gỡ Admin' : 'Làm Admin'}
                            </button>
                            <button class="btn-secondary" style="padding: 4px 8px; font-size:0.75rem; color: #ff1744; border-color: rgba(255, 23, 68, 0.3);"
                                    onclick="window.deleteUserAdmin('${doc.id}')">
                                Xoá
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Render Pagination Controls for Users
        let paginationContainer = document.getElementById('admin-users-pagination');
        if (!paginationContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'admin-users-pagination';
            paginationContainer.style.display = 'flex';
            paginationContainer.style.justifyContent = 'center';
            paginationContainer.style.alignItems = 'center';
            paginationContainer.style.gap = '15px';
            paginationContainer.style.marginTop = '20px';
            list.parentElement.parentElement.appendChild(paginationContainer); // Appending to the table container
        }

        if (totalPages > 1) {
            paginationContainer.innerHTML = `
                <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.changeAdminUserPage(${window.currentAdminUserPage - 1})" ${window.currentAdminUserPage === 1 ? 'disabled' : ''}>Trước</button>
                <span>Trang ${window.currentAdminUserPage} / ${totalPages}</span>
                <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.changeAdminUserPage(${window.currentAdminUserPage + 1})" ${window.currentAdminUserPage === totalPages ? 'disabled' : ''}>Sau</button>
            `;
        } else {
            paginationContainer.innerHTML = '';
        }
}

window.loadAdminUsers = () => {
    const list = document.getElementById('admin-users-list');
    if (!list) return;

    if (adminUsersListenerActive) {
        renderAdminUsersList();
        return;
    }

    const { db, collection, onSnapshot, query, orderBy, limit } = window.firebase;
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(ADMIN_LIST_LIMIT));

    adminUsersListenerActive = true;
    setFirestoreUnsub('adminUsers', onSnapshot(q, (snapshot) => {
        cachedAdminUsersSnap = snapshot;
        renderAdminUsersList();
    }));
};

window.changeAdminUserPage = (newPage) => {
    window.currentAdminUserPage = newPage;
    renderAdminUsersList();
};

window.updateUserCoins = async (userId) => {
    const { db, doc, updateDoc } = window.firebase;
    const input = document.getElementById(`user-coins-${userId}`);
    const newAmount = parseInt(input.value);
    
    if (isNaN(newAmount)) return showToast("Vui lòng nhập số hợp lệ.");

    try {
        await updateDoc(doc(db, "users", userId), { coins: newAmount });
        showToast("Đã cập nhật số dư Coin.");
    } catch (e) {
        showToast("Lỗi: " + e.message);
    }
};

window.makeAdminDirect = async (userId, currentRole) => {
    const { db, doc, updateDoc } = window.firebase;
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
        await updateDoc(doc(db, "users", userId), { role: newRole });
        showToast(`Đã chuyển thành ${newRole}`);
    } catch (e) {
        showToast("Lỗi: " + e.message);
    }
};

window.deleteUserAdmin = async (userId) => {
    if (!confirm("Bạn có chắc chắn muốn xoá người dùng này? Thao tác này không thể hoàn tác.")) return;
    const { db, doc, deleteDoc } = window.firebase;
    try {
        await deleteDoc(doc(db, "users", userId));
        showToast("Đã xoá người dùng.");
    } catch (e) {
        showToast("Lỗi: " + e.message);
    }
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
                <span class="info-label">🔧 Kiểu dịch vụ</span>
                <span class="info-value" style="color: var(--accent); font-weight: bold;">${SERVICE_TYPE_MAP()[d.serviceType] || d.serviceType}</span>
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
                <button class="download-pill-btn image-btn" style="margin-top: 10px; width: fit-content;" onclick="window.downloadUrl(event, '${d.characterImageLink}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    Tải Ảnh Gốc
                </button>
            </div>
            <div class="info-item">
                <span class="info-label">📹 Video tham chiếu</span>
                <div class="admin-preview-box" onclick="window.open('${d.referenceVideoLink}', '_blank')">
                    <video src="${d.referenceVideoLink}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>
                    <div class="preview-overlay">Xem video</div>
                </div>
                <button class="download-pill-btn video-btn" style="margin-top: 10px; width: fit-content;" onclick="window.downloadUrl(event, '${d.referenceVideoLink}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Tải Video Mẫu
                </button>
            </div>
            ${d.resultLink ? `
            <div class="info-item">
                <span class="info-label">✨ Video kết quả</span>
                <div class="admin-preview-box" onclick="window.open('${d.resultLink}', '_blank')">
                    <video src="${d.resultLink}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>
                    <div class="preview-overlay">Xem video</div>
                </div>
                <button class="download-pill-btn video-btn" style="margin-top: 10px; width: fit-content;" onclick="window.downloadUrl(event, '${d.resultLink}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Tải Video Kết Quả
                </button>
            </div>
            ` : ''}
        </div>
    `;

    document.getElementById('admin-status').value = d.status;
    document.getElementById('admin-result-link').value = d.resultLink || "";
    document.getElementById('admin-note').value = d.adminNote || "";

    openModal('admin-detail-modal');
};

document.getElementById('admin-update-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { db, doc, getDoc, updateDoc, serverTimestamp } = window.firebase;
    const newStatus = document.getElementById('admin-status').value;
    const resultLink = document.getElementById('admin-result-link').value;

    try {
        // 1. Update Firestore
        await updateDoc(doc(db, "orders", currentAdminOrderId), {
            status: newStatus,
            resultLink: resultLink,
            adminNote: document.getElementById('admin-note').value,
            updatedAt: serverTimestamp()
        });

        showToast("Cập nhật đơn hàng thành công!");
        closeModal('admin-detail-modal');

        // 2. If status is completed, send automated email
        const snap = await getDoc(doc(db, "orders", currentAdminOrderId));
        if (snap.exists()) {
            const orderData = snap.data();
            const shortId = currentAdminOrderId.substring(currentAdminOrderId.length - 6).toUpperCase();
            
            // Bắn email
            if (newStatus === 'completed' && orderData.userEmail) {
                sendCompletionEmail(currentAdminOrderId, orderData);
            }

            // Bắn Telegram thông báo trạng thái cập nhật thủ công
            let teleMsg = '';
            if (newStatus === 'processing') {
                teleMsg = `⚙️ <b>ĐƠN HÀNG ĐANG XỬ LÝ (Mã #${shortId})</b>\n👤 Khách: ${escapeHTML(orderData.userName || 'Khách hàng')}\n📧 Email: ${escapeHTML(orderData.userEmail || 'N/A')}\n⏳ Trạng thái: Admin chuyển trạng thái sang xử lý.`;
            } else if (newStatus === 'completed') {
                teleMsg = `✅ <b>ĐƠN HÀNG HOÀN THÀNH (Mã #${shortId})</b>\n👤 Khách: ${escapeHTML(orderData.userName || 'Khách hàng')}\n📧 Email: ${escapeHTML(orderData.userEmail || 'N/A')}\n📹 Kết quả: <a href="${resultLink}">Xem kết quả</a>`;
            } else if (newStatus === 'failed') {
                teleMsg = `❌ <b>ĐƠN HÀNG THẤT BẠI (Mã #${shortId})</b>\n👤 Khách: ${escapeHTML(orderData.userName || 'Khách hàng')}\n📧 Email: ${escapeHTML(orderData.userEmail || 'N/A')}\n📝 Lý do: ${escapeHTML(document.getElementById('admin-note').value || 'Không hợp lệ')}`;
            }
            if (teleMsg) {
                sendTelegramMessage(teleMsg);
            }
        }
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

window.deleteOrder = async (event, orderId) => {
    event.stopPropagation();
    if (!confirm("Bạn có chắc chắn muốn xóa đơn hàng này không? Hành động này không thể hoàn tác.")) return;
    const { db, doc, deleteDoc } = window.firebase;
    try {
        await deleteDoc(doc(db, "orders", orderId));
        showToast("Đã xóa đơn hàng.");
    } catch (e) {
        console.error(e);
        showToast("Lỗi khi xóa đơn hàng.");
    }
};

window.deleteTopup = async (event, topupId) => {
    event.stopPropagation();
    if (!confirm("Bạn có chắc chắn muốn xóa yêu cầu nạp coin này không? Hành động này không thể hoàn tác.")) return;
    const { db, doc, deleteDoc } = window.firebase;
    try {
        await deleteDoc(doc(db, "topups", topupId));
        showToast("Đã xóa yêu cầu nạp.");
    } catch (e) {
        console.error(e);
        showToast("Lỗi khi xóa yêu cầu nạp.");
    }
};

function renderAdminTopupsList() {
    const snapshot = cachedAdminTopupsSnap;
    const list = document.getElementById('admin-topups-list');
    if (!list || !snapshot) return;

    const searchVal = getAdminSearchVal();

            if (snapshot.empty) {
                list.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:2rem;">Không có dữ liệu đơn nạp</td></tr>';
                return;
            }

            const filteredDocs = snapshot.docs.filter(doc => {
                const d = doc.data();
                const text = `${d.userName} ${d.userEmail} ${d.transferContent} ${d.packageName}`.toLowerCase();
                return text.includes(searchVal);
            });

            if (filteredDocs.length === 0) {
                list.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:2rem;">Không tìm thấy kết quả nào</td></tr>';
                return;
            }

            // 1. Convert to objects and sort by time
            let dataList = filteredDocs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // 2. Group by User (sort users by their latest request)
            const userLatestTime = {};
            dataList.forEach(d => {
                const time = d.createdAt?.toMillis ? d.createdAt.toMillis() : (d.createdAt || 0);
                if (!userLatestTime[d.userId] || time > userLatestTime[d.userId]) {
                    userLatestTime[d.userId] = time;
                }
            });

            dataList.sort((a, b) => {
                if (a.userId !== b.userId) {
                    return userLatestTime[b.userId] - userLatestTime[a.userId];
                }
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
                return timeB - timeA;
            });

            // --- Client-side Pagination for Topups ---
            const ITEMS_PER_PAGE = 10;
            if (!window.currentAdminTopupPage) window.currentAdminTopupPage = 1;
            const totalPages = Math.ceil(dataList.length / ITEMS_PER_PAGE);
            
            if (window.currentAdminTopupPage > totalPages && totalPages > 0) {
                window.currentAdminTopupPage = totalPages;
            }

            const startIndex = (window.currentAdminTopupPage - 1) * ITEMS_PER_PAGE;
            const pageData = dataList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

            let lastUserId = null;
            let groupColor = 'transparent';
            const groupColors = ['rgba(255, 255, 255, 0.03)', 'transparent'];
            let colorIdx = 0;

            list.innerHTML = pageData.map(d => {
                if (d.userId !== lastUserId) {
                    groupColor = groupColors[colorIdx % 2];
                    colorIdx++;
                    lastUserId = d.userId;
                }
                const safeUrl = d.proofLink ? d.proofLink.replace(/'/g, "\\'") : '';
                return `
                    <tr style="background: ${groupColor}; transition: background 0.3s ease;">
                        <td>${escapeHTML(d.userName) || 'N/A'}<br><small>${escapeHTML(d.userEmail) || ''}</small></td>
                        <td>${escapeHTML(d.packageName) || ''}<br><strong>${d.amount ? d.amount.toLocaleString() : 0}đ</strong></td>
                        <td style="color: #ffde00; font-weight: 700;">${escapeHTML(d.transferContent) || ''}</td>
                        <td>
                            <div class="proof-thumbnail" style="width: 50px; height: 50px; border-radius: 4px; overflow: hidden; border: 1px solid var(--glass-border); cursor: pointer;" onclick="window.viewFullImage('${safeUrl}')">
                                <img src="${d.proofLink}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://via.placeholder.com/50?text=Lỗi'">
                            </div>
                        </td>
                        <td>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                ${currentTopupStatus === 'pending' ? `
                                    <button class="btn-primary" style="padding: 4px 8px; font-size:0.75rem; background: #27ae60;" onclick="window.approveTopup('${d.id}', '${d.userId}', ${d.coins})">Duyệt</button>
                                    <button class="btn-secondary" style="padding: 4px 8px; font-size:0.75rem; background: #c0392b;" onclick="window.rejectTopup('${d.id}')">Hủy</button>
                                ` : `
                                    <span class="status-badge status-${d.status}">${STATUS_MAP()[d.status] || d.status}</span>
                                `}
                                <button class="btn-delete" style="padding: 6px; background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.2); border-radius: 6px; cursor: pointer; color: #ff3b30;" onclick="window.deleteTopup(event, '${d.id}')" title="Xóa">
                                    <svg style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            // Render Pagination Controls for Topups
            let paginationContainer = document.getElementById('admin-topups-pagination');
            if (!paginationContainer) {
                paginationContainer = document.createElement('div');
                paginationContainer.id = 'admin-topups-pagination';
                paginationContainer.style.display = 'flex';
                paginationContainer.style.justifyContent = 'center';
                paginationContainer.style.alignItems = 'center';
                paginationContainer.style.gap = '15px';
                paginationContainer.style.marginTop = '20px';
                list.parentElement.parentElement.appendChild(paginationContainer); // Appending to the table container
            }

            if (totalPages > 1) {
                paginationContainer.innerHTML = `
                    <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.changeAdminTopupPage(${window.currentAdminTopupPage - 1})" ${window.currentAdminTopupPage === 1 ? 'disabled' : ''}>Trước</button>
                    <span>Trang ${window.currentAdminTopupPage} / ${totalPages}</span>
                    <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.changeAdminTopupPage(${window.currentAdminTopupPage + 1})" ${window.currentAdminTopupPage === totalPages ? 'disabled' : ''}>Sau</button>
                `;
            } else {
                paginationContainer.innerHTML = '';
            }
}

function renderAdminOrdersList() {
    const snapshot = cachedAdminOrdersSnap;
    const list = document.getElementById('admin-orders-list');
    if (!list || !snapshot) return;

    const searchVal = getAdminSearchVal();

            if (snapshot.empty) {
                list.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.5; padding:2rem;">Chưa có đơn hàng nào trong mục này</td></tr>';
                document.getElementById('admin-orders-pagination')?.remove();
                return;
            }

            const filteredDocs = snapshot.docs.filter(doc => {
                const d = doc.data();
                const orderId = doc.id.substring(doc.id.length - 6).toUpperCase();
                const text = `${orderId} ${d.userName} ${d.userEmail} ${d.packageName} ${d.serviceType}`.toLowerCase();
                return text.includes(searchVal);
            });

            if (filteredDocs.length === 0) {
                list.innerHTML = '<tr><td colspan="6" style="text-align:center; opacity:0.5; padding:2rem;">Không tìm thấy kết quả nào</td></tr>';
                document.getElementById('admin-orders-pagination')?.remove();
                return;
            }

            // 1. Convert to objects and sort by time
            let dataList = filteredDocs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. Group by User (sort users by their latest request)
            const userLatestTime = {};
            dataList.forEach(d => {
                const time = d.createdAt?.toMillis ? d.createdAt.toMillis() : (d.createdAt || 0);
                if (!userLatestTime[d.userId] || time > userLatestTime[d.userId]) {
                    userLatestTime[d.userId] = time;
                }
            });

            dataList.sort((a, b) => {
                if (a.userId !== b.userId) {
                    return userLatestTime[b.userId] - userLatestTime[a.userId];
                }
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
                return timeB - timeA;
            });

            // --- Client-side Pagination ---
            const ITEMS_PER_PAGE = 10;
            if (!window.currentAdminOrderPage) window.currentAdminOrderPage = 1;
            const totalPages = Math.ceil(dataList.length / ITEMS_PER_PAGE);
            
            if (window.currentAdminOrderPage > totalPages && totalPages > 0) {
                window.currentAdminOrderPage = totalPages;
            }

            const startIndex = (window.currentAdminOrderPage - 1) * ITEMS_PER_PAGE;
            const pageData = dataList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

            let lastUserId = null;
            let groupColor = 'transparent';
            const groupColors = ['rgba(255, 255, 255, 0.03)', 'transparent'];
            let colorIdx = 0;

            list.innerHTML = pageData.map(d => {
                if (d.userId !== lastUserId) {
                    groupColor = groupColors[colorIdx % 2];
                    colorIdx++;
                    lastUserId = d.userId;
                }
                const orderId = d.id.substring(d.id.length - 6).toUpperCase();
                return `
                    <tr style="background: ${groupColor}; transition: background 0.3s ease;">
                        <td style="font-family: monospace; font-weight: bold; color: var(--accent-primary);">#${orderId}</td>
                        <td>${escapeHTML(d.userName) || 'Khách'}<br><small>${escapeHTML(d.userEmail) || ''}</small></td>
                        <td>${escapeHTML(d.packageName) || ''} (${SERVICE_TYPE_MAP()[d.serviceType] || d.serviceType})</td>
                        <td>${d.costCoins || 0} Coin</td>
                        <td>
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <button class="btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="window.openAdminDetail('${d.id}')">Cập nhật</button>
                                <button class="download-pill-btn image-btn" style="padding: 4px; border-radius: 6px;" title="Tải ảnh" onclick="window.downloadUrl(event, '${d.characterImageLink}')">
                                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><polyline points="21 15 16 10 5 21"></polyline></svg>
                                </button>
                                <button class="download-pill-btn video-btn" style="padding: 4px; border-radius: 6px;" title="Tải video mẫu" onclick="window.downloadUrl(event, '${d.referenceVideoLink}')">
                                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline></svg>
                                </button>
                                <button class="btn-delete" style="padding: 6px; background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.2); border-radius: 6px; cursor: pointer; color: #ff3b30;" onclick="window.deleteOrder(event, '${d.id}')" title="Xóa đơn hàng">
                                    <svg style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            // Render Pagination Controls
            let paginationContainer = document.getElementById('admin-orders-pagination');
            if (!paginationContainer) {
                paginationContainer = document.createElement('div');
                paginationContainer.id = 'admin-orders-pagination';
                paginationContainer.style.display = 'flex';
                paginationContainer.style.justifyContent = 'center';
                paginationContainer.style.alignItems = 'center';
                paginationContainer.style.gap = '15px';
                paginationContainer.style.marginTop = '20px';
                list.parentElement.parentElement.appendChild(paginationContainer); // Appending to the table container
            }

            if (totalPages > 1) {
                paginationContainer.innerHTML = `
                    <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.changeAdminOrderPage(${window.currentAdminOrderPage - 1})" ${window.currentAdminOrderPage === 1 ? 'disabled' : ''}>Trước</button>
                    <span>Trang ${window.currentAdminOrderPage} / ${totalPages}</span>
                    <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.changeAdminOrderPage(${window.currentAdminOrderPage + 1})" ${window.currentAdminOrderPage === totalPages ? 'disabled' : ''}>Sau</button>
                `;
            } else {
                paginationContainer.innerHTML = '';
            }
}

function loadAdminPanel() {
    if (!window.adminSearchInited) {
        document.getElementById('admin-search-input')?.addEventListener('input', scheduleAdminPanelRerender);
        window.adminSearchInited = true;
    }

    const { db, collection, query, where, onSnapshot, orderBy, limit } = window.firebase;

    if (adminTopupsListenerStatus !== currentTopupStatus) {
        adminTopupsListenerStatus = currentTopupStatus;
        const qTopups = query(
            collection(db, "topups"),
            where("status", "==", currentTopupStatus),
            orderBy("createdAt", "desc"),
            limit(ADMIN_LIST_LIMIT)
        );
        setFirestoreUnsub('adminTopups', onSnapshot(qTopups,
            (snapshot) => {
                cachedAdminTopupsSnap = snapshot;
                renderAdminTopupsList();
            },
            (error) => {
                console.error("Topups Snapshot Error:", error);
                showToast("Lỗi tải danh sách nạp tiền: " + error.message);
            }
        ));
    } else {
        renderAdminTopupsList();
    }

    if (adminOrdersListenerStatus !== currentOrderStatus) {
        adminOrdersListenerStatus = currentOrderStatus;
        const qOrders = query(
            collection(db, "orders"),
            where("status", "==", currentOrderStatus),
            orderBy("createdAt", "desc"),
            limit(ADMIN_LIST_LIMIT)
        );
        setFirestoreUnsub('adminOrders', onSnapshot(qOrders,
            (snapshot) => {
                cachedAdminOrdersSnap = snapshot;
                renderAdminOrdersList();
            },
            (error) => {
                console.error("Orders Snapshot Error:", error);
                showToast("Lỗi tải danh sách đơn hàng: " + error.message);
            }
        ));
    } else {
        renderAdminOrdersList();
    }
}

window.changeAdminOrderPage = (newPage) => {
    window.currentAdminOrderPage = newPage;
    renderAdminOrdersList();
};

window.changeAdminTopupPage = (newPage) => {
    window.currentAdminTopupPage = newPage;
    renderAdminTopupsList();
};

window.openUserOrderDetail = async (orderId) => {
    const { db, doc, getDoc } = window.firebase;
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) return;
    const d = snap.data();
    const shortId = snap.id.substring(snap.id.length - 6).toUpperCase();
    const statusLabel = STATUS_MAP()[d.status] || d.status;

    // Timeline Steps logic
    const steps = ['pending', 'processing', 'completed'];
    const currentStepIdx = steps.indexOf(d.status) === -1 ? 0 : steps.indexOf(d.status);

    const timelineHtml = `
        <div class="status-timeline">
            <div class="timeline-step ${currentStepIdx >= 0 ? 'active' : ''}">
                <div class="step-dot">1</div>
                <span class="step-label">${t('status.pending')}</span>
            </div>
            <div class="timeline-step ${currentStepIdx >= 1 ? 'active' : ''}">
                <div class="step-dot">2</div>
                <span class="step-label">${t('status.processing')}</span>
            </div>
            <div class="timeline-step ${currentStepIdx >= 2 ? 'active' : ''}">
                <div class="step-dot">3</div>
                <span class="step-label">${t('status.completed')}</span>
            </div>
        </div>
    `;

    const serviceLabel = SERVICE_TYPE_MAP()[d.serviceType] || d.serviceType;

    document.getElementById('user-order-info').innerHTML = `
        ${timelineHtml}
        <div class="admin-info-grid">
            <div class="info-item">
                <span class="info-label">${t('modals.order_id')}</span>
                <span class="info-value" style="font-family: monospace; font-weight: bold; color: var(--accent-primary);">#${shortId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">${t('modals.order_status')}</span>
                <span class="info-value"><span class="status-badge status-${d.status}">${statusLabel}</span></span>
            </div>
            <div class="info-item">
                <span class="info-label">${t('modals.order_package')}</span>
                <span class="info-value">${d.packageName} (${serviceLabel})</span>
            </div>
            <div class="info-item">
                <span class="info-label">${t('modals.order_aspect')}</span>
                <span class="info-value">${d.aspectRatio || '16:9'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">${t('modals.order_char_img')}</span>
                <div class="admin-preview-box" onclick="event.stopPropagation(); window.viewFullImage('${d.characterImageLink}')">
                    <img src="${d.characterImageLink}">
                    <div class="preview-overlay" data-i18n="modals.preview_expand">Phóng to</div>
                </div>
            </div>
            <div class="info-item">
                <span class="info-label">${t('modals.order_ref_video')}</span>
                <div class="admin-preview-box" onclick="event.stopPropagation(); window.open('${d.referenceVideoLink}', '_blank')">
                    <video src="${d.referenceVideoLink}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>
                    <div class="preview-overlay" data-i18n="modals.preview_view">Xem gốc</div>
                </div>
            </div>
            ${(() => {
            const finalResultLink = d.resultLink;
            if (!finalResultLink) return '';
            const isWorkerLink = finalResultLink.includes('workers.dev');
            const downloadUrl = isWorkerLink ? finalResultLink + (finalResultLink.includes('?') ? '&' : '?') + 'download=1' : finalResultLink;
            return `
                <div class="info-item" style="grid-column: span 2;">
                    <span class="info-label">${t('modals.order_result_video')}</span>
                    <div style="width: 100%; margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: #000; position: relative; display: flex; justify-content: center; align-items: center;">
                        <video controls playsinline preload="metadata" style="width: 100%; max-height: 360px; display: block; object-fit: contain;">
                            <source src="${finalResultLink}" type="video/mp4">
                            Trình duyệt của bạn không hỗ trợ phát video trực tiếp.
                        </video>
                    </div>
                    <a href="${downloadUrl}" download="motionai_video_${shortId}.mp4" target="_blank" class="btn-primary" style="display:block; text-align:center; padding: 12px; margin-top: 12px; text-decoration:none; width: 100%; font-weight: 600;">${t('modals.order_download')}</a>
                    <p style="font-size: 0.75rem; color: #ffde00; margin-top: 8px; text-align: center;">💡 Mẹo iPhone (Safari/Chrome): Nếu bấm nút Tải không được, bạn hãy <b>nhấn giữ trực tiếp vào khung video ở trên</b> rồi chọn <b>"Lưu video"</b> (hoặc <b>"Tải tệp liên kết"</b>) nhé!</p>
                    <p style="font-size: 0.75rem; color: var(--danger); margin-top: 4px; text-align: center;">${t('modals.order_expiry_warn')}</p>
                </div>
                `;
        })()}
            ${d.adminNote ? `
            <div class="info-item" style="grid-column: span 2;">
                <span class="info-label">${t('modals.order_system_note')}</span>
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

    if (!file) return showToast(t('admin.upload_video'));

    try {
        btn.disabled = true;
        btn.innerText = t('admin.uploading');
        statusDiv.style.display = 'block';
        statusDiv.innerText = t('admin.upload_start');

        const uploadedUrl = await uploadFile(file, "results");

        document.getElementById('admin-result-link').value = uploadedUrl;
        statusDiv.innerHTML = `<span style="color: #27ae60;">${t('admin.upload_success')}</span>`;
        showToast(t('admin.toast_upload_success'));
    } catch (error) {
        console.error(error);
        statusDiv.innerHTML = `<span style="color: #c0392b;">❌ ${t('common.error')}: ${error.message}</span>`;
        showToast(t('admin.toast_upload_error'));
    } finally {
        btn.disabled = false;
        btn.innerText = t('admin.btn_upload');
    }
};

// --- Utilities ---
function escapeHTML(str) {
    if (!str) return "";
    return str.toString().replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

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

// --- Google Analytics / Firebase Tracking Helper ---
function trackAnalyticsEvent(eventName, params = {}) {
    const { analytics, logEvent } = window.firebase;
    if (analytics) {
        logEvent(analytics, eventName, params);
        console.log(`📊 Firebase Analytics: ${eventName}`, params);
    }
}

async function sendTelegramMessage(text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: text,
                parse_mode: 'HTML'
            })
        });
        const data = await response.json();
        if (!data.ok) {
            console.error("Telegram Error:", data);
        } else {
            console.log("Telegram Notify Sent.");
        }
    } catch (e) {
        console.error("Telegram Notify Error:", e);
    }
}

window.testTelegram = () => {
    const msg = `🔔 <b>TEST THÔNG BÁO TELEGRAM</b>\n\n✅ Kết nối thành công!\n🕒 Thời gian: ${new Date().toLocaleString('vi-VN')}`;
    sendTelegramMessage(msg);
    showToast("Đã gửi tin nhắn test đến Telegram. Vui lòng kiểm tra!");
};

// --- EmailJS Auto-Notification ---
async function sendCompletionEmail(orderId, orderData) {
    console.log("📧 Attempting to send completion email to:", orderData.userEmail);

    const shortOrderId = orderId.substring(orderId.length - 6).toUpperCase();
    const serviceLabel = SERVICE_TYPE_MAP()[orderData.serviceType] || orderData.serviceType;

    const templateParams = {
        user_name: orderData.userName || "Khách hàng",
        user_email: orderData.userEmail,
        order_id: shortOrderId,
        result_link: orderData.resultLink,
        service_label: serviceLabel
    };

    const payload = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: templateParams
    };

    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("✅ Email sent successfully via EmailJS!");
            showToast("✨ Đã gửi thông báo qua Email cho khách!");
        } else {
            const errText = await response.text();
            console.error("❌ EmailJS error:", errText);
            showToast("⚠️ Cập nhật đơn OK nhưng gửi Mail lỗi: " + errText);
        }
    } catch (error) {
        console.error("❌ Network error sending email:", error);
        showToast("⚠️ Lỗi mạng khi gửi email!");
    }
}

// ==========================================
// NEW: 4 Model AI & Lemon Squeezy Integration
// ==========================================

export function renderAIModels() {
    const grid = document.getElementById('ai-models-grid');
    if (!grid) return;

    grid.innerHTML = AI_MODELS.map(model => {
        const title = t(model.titleKey);
        const desc = t(model.descKey);
        const createVideoText = t('models.create_video') || 'Tạo Video';

        return `
            <div class="ai-model-card glass-panel" id="model-${model.id}">
                <div class="ai-model-visual-composite">
                    <!-- Frame 1: Character Photo -->
                    <div class="composite-frame char-frame">
                        <img src="${model.demoChar}" alt="Character" loading="lazy">
                        <span class="frame-label">${currentLang === 'vi' ? 'Ảnh nhân vật' : 'Character Photo'}</span>
                    </div>

                    <div class="composite-operator">+</div>

                    <!-- Frame 2: Motion Reference Video -->
                    <div class="composite-frame ref-frame">
                        <video src="${model.demoRef}" autoplay muted loop playsinline></video>
                        <span class="frame-label">${currentLang === 'vi' ? 'Video mẫu' : 'Motion Ref'}</span>
                    </div>

                    <div class="composite-operator">=</div>

                    <!-- Frame 3: AI Video Result -->
                    <div class="composite-frame result-frame">
                        <video src="${model.demoResult}" autoplay muted loop playsinline></video>
                        <span class="frame-label color-accent">${currentLang === 'vi' ? 'Kết quả AI' : 'AI Result'}</span>
                    </div>
                </div>

                <div class="ai-model-info">
                    <div class="ai-model-meta">
                        <span class="model-badge">20s Video</span>
                        <span class="cost-badge">${model.cost} Coins</span>
                    </div>
                    <h3 class="ai-model-title">${title}</h3>
                    <p class="ai-model-desc">${desc}</p>

                    <button class="btn-primary select-model-btn" onclick="window.createVideoWithModel('${model.id}')">
                        <svg class="nav-icon" style="stroke: white; width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
                        </svg>
                        <span>${createVideoText}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}
window.renderAIModels = renderAIModels;

window.createVideoWithModel = (modelId) => {
    if (!currentUser) return login();

    // Lưu trữ Model ID đã chọn
    window.selectedAIModelId = modelId;
    const model = AI_MODELS.find(m => m.id === modelId);
    if (!model) return;

    // Tự động chuyển radio chọn Kiểu dịch vụ (service-type) tương ứng
    const serviceRadio = document.querySelector(`input[name="service-type"][value="${model.serviceType}"]`);
    if (serviceRadio) {
        serviceRadio.checked = true;
        serviceRadio.dispatchEvent(new Event('change'));
    }

    // Mở Order Modal
    window.openOrderModal();
};

window.switchPaymentTab = (tabName) => {
    const vietqrBtn = document.getElementById('tab-vietqr-btn');
    const intlBtn = document.getElementById('tab-intl-btn');
    const vietqrContent = document.getElementById('payment-content-vietqr');
    const intlContent = document.getElementById('payment-content-intl');

    if (!vietqrBtn || !intlBtn || !vietqrContent || !intlContent) return;

    if (tabName === 'vietqr') {
        vietqrBtn.classList.add('active');
        intlBtn.classList.remove('active');
        vietqrContent.style.display = 'block';
        intlContent.style.display = 'none';
    } else {
        vietqrBtn.classList.remove('active');
        intlBtn.classList.add('active');
        vietqrContent.style.display = 'none';
        intlContent.style.display = 'block';

        // Cập nhật thông tin gói USD tương ứng
        if (selectedTopupPackage) {
            const intlInfo = document.getElementById('intl-package-info');
            if (intlInfo) {
                intlInfo.innerHTML = `
                    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight:600; margin-bottom: 5px;">Selected Package</div>
                    <div style="font-size: 1.8rem; font-weight: 800; color: var(--accent); margin: 0.5rem 0; letter-spacing: 0.5px;">${selectedTopupPackage.name}</div>
                    <div style="font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 10px;">+${selectedTopupPackage.coins} Coins</div>
                    <div style="font-size: 1.4rem; font-weight: 800; color: #ffde00; margin-top: 0.8rem; background: rgba(255,222,0,0.1); padding: 8px; border-radius: 6px; display: inline-block;">Price: ${selectedTopupPackage.usdPrice || '$4.99'}</div>
                `;
            }

            // Gắn link thanh toán Lemon Squeezy kèm custom data user_id
            const payBtn = document.getElementById('btn-lemonsqueezy-pay');
            if (payBtn) {
                const checkoutUrl = `${selectedTopupPackage.lemonsqueezyUrl}?checkout[custom][user_id]=${currentUser.uid}&checkout[custom][package_id]=${selectedTopupPackage.id}&checkout[email]=${encodeURIComponent(currentUser.email || '')}`;
                payBtn.href = checkoutUrl;

                // Khởi tạo Lemon Squeezy Popup
                if (window.LemonSqueezy) {
                    window.LemonSqueezy.Setup();
                }
            }
        }
    }
};

