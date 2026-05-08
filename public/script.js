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

const TREND_VIDEOS = [
    { id: 't5', title: 'Sexy Dance', thumb: 'https://placehold.co/200x300/1a1a2e/ffffff?text=Sexy+Dance', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/sexy%20dance.mp4' },
    { id: 't6', title: 'Trend L S Mix', thumb: 'https://placehold.co/200x300/1a1a2e/ffffff?text=Trend+LS', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/trend%20L%20S.mp4' },
    { id: 't7', title: 'Trend Ngọc Anh', thumb: 'https://placehold.co/200x300/1a1a2e/ffffff?text=Ngoc+Anh', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/trend%20ngo%CC%A3c%20anh%20lu%CC%A3c%20nguye%CC%82%CC%83n.mp4' },
    { id: 't8', title: 'What Do You Want', thumb: 'https://placehold.co/200x300/1a1a2e/ffffff?text=What+Do+You+Want', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/what%20do%20you%20want%20from%20me.mp4' },
    { id: 't9', title: 'Trend Nhạc Hay', thumb: 'https://placehold.co/200x300/1a1a2e/ffffff?text=Nhac+Hay', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/nha%CC%A3c%20hay.mp4' },
    { id: 't10', title: 'Anh tên là Bằng', thumb: 'https://placehold.co/200x300/1a1a2e/ffffff?text=Anh+Ten+Bang', url: 'https://pub-2b53cd37b4a44642afdbb8bb470bde66.r2.dev/anh%20te%CC%82n%20la%CC%80%20ba%CC%86%CC%80ng.mp4' }
];

const MODELS = {
    basic: { name: "Model Tiêu chuẩn", cost: 6 },
    pro: { name: "Model Cao cấp", cost: 12 }
};

const SERVICE_PACKAGES = [
    { id: 'basic', name: 'Basic', cost: 6, features: ['Chất lượng SD', 'Xử lý 15-30p', '1 nhân vật'] },
    { id: 'plus', name: 'Plus', cost: 12, features: ['Chất lượng HD', 'Ưu tiên xử lý', 'Hỗ trợ sửa đổi'], featured: true },
    { id: 'viral', name: 'Viral', cost: 25, features: ['Chất lượng 4K', 'Xử lý siêu tốc', 'Sửa đổi tối đa 3 lần'] }
];

let currentUser = null;
let selectedTopupPackage = null;
let initialCoinsBeforeTopup = 0; // Để theo dõi số dư trước khi nạp
const SUPER_ADMIN_EMAILS = ["traderfinn0312@gmail.com", "dinhhoangvan.hh@gmail.com"]; // Danh sách admin khởi tạo
// --- i18n Logic ---
let currentLang = localStorage.getItem('app_lang');
if (!['vi', 'en'].includes(currentLang)) {
    currentLang = navigator.language.startsWith('en') ? 'en' : 'vi';
}
window.currentLang = currentLang;

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
        loadMyOrders();
        loadMyTopups();
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
    // Call again after dynamic parts are rendered
    applyTranslations();
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

// --- Auth Functions ---
window.renderShowcase = () => {
    const gallery = document.getElementById('showcase-gallery');
    if (!gallery) return;
    
    gallery.innerHTML = TREND_VIDEOS.map(v => `
        <div class="showcase-card">
            <video class="showcase-video" src="${v.url}" poster="${v.thumb}" muted loop playsinline autoplay onmouseover="this.muted=false; this.play()" onmouseout="this.pause()"></video>
            <div class="showcase-info">
                <div class="showcase-title">${v.title}</div>
                <button class="use-trend-btn" onclick="window.useTrendShortcut('${v.id}', '${v.url}')">
                    ${window.t('showcase.use_this')}
                </button>
            </div>
        </div>
    `).join('');
};

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
        showToast(t('common.toast_login_success'));
    } catch (error) {
        console.error("Login Error", error);
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

// --- User Profile & Coin Balance ---
async function handleUserLoggedIn(user) {
    const { db, doc, getDoc, setDoc, onSnapshot } = window.firebase;

    // Hiển thị Profile Menu thay vì ghi đè HTML
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('user-profile-menu').style.display = 'block';
    document.getElementById('user-avatar').src = user.photoURL;
    document.getElementById('dropdown-user-name').innerText = user.displayName;
    document.getElementById('dropdown-user-email').innerText = user.email;

    // Hiển thị Dashboard link và Hamburger menu
    const dbItem = document.getElementById('db-dropdown-item');
    if (dbItem) dbItem.style.display = 'flex';
    const navHamburger = document.getElementById('nav-hamburger-menu');
    if (navHamburger) navHamburger.style.display = 'block';

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
                showToast(t('common.toast_coins_added'));
                closeModal('topup-modal');
                // Hiệu ứng pháo hoa hoặc rung nhẹ balance
                document.getElementById('coin-balance').classList.add('coin-update-glow');
                setTimeout(() => document.getElementById('coin-balance').classList.remove('coin-update-glow'), 2000);

                // Notify Telegram
                const addedCoins = currentCoins - initialCoinsBeforeTopup;
                sendTelegramMessage(`💰 *NẠP COIN THÀNH CÔNG!*\n👤 Khách: ${data.displayName}\n📧 Email: ${data.email}\n✨ Đã cộng: +${addedCoins} Coin\n💰 Số dư mới: ${currentCoins} Coin`);
            }

            document.getElementById('coin-balance').innerText = currentCoins;
            document.getElementById('user-greeting').innerText = t('dashboard.greeting', { name: data.displayName });
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
    const navHamburger = document.getElementById('nav-hamburger-menu');
    if (navHamburger) navHamburger.style.display = 'none';

    // Toggle Dashboard sub-elements
    const dashIn = document.getElementById('dashboard-logged-in');
    const dashOut = document.getElementById('dashboard-auth-placeholder');
    if (dashIn) dashIn.style.display = 'none';
    if (dashOut) dashOut.style.display = 'block';

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

    const html = COIN_PACKAGES.map(pkg => `
        <div class="price-card ${pkg.featured ? 'featured' : ''}">
            ${pkg.featured ? `<div class="featured-badge">🔥 ${t('pricing.featured')}</div>` : ''}
            ${pkg.note ? `<div class="bonus-tag">${pkg.note}</div>` : ''}
            
                <div class="coin-visual-wrapper">
                    <svg class="coin-icon-svg" style="width: 28px; height: 28px;" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" fill="url(#coin-gradient)" fill-opacity="0.2" stroke="url(#coin-gradient)" stroke-width="2"/>
                        <path d="M12 6L17.2 9V15L12 18L6.8 15V9L12 6Z" fill="url(#coin-gradient)"/>
                        <path d="M12 9V15M9 12H15" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span>${pkg.coins}</span>
                </div>

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
        <div class="template-item" id="tpl-${t.id}" onclick="window.previewTemplate('${t.id}')">
            <video class="template-video" src="${t.url}" poster="${t.thumb}" muted loop playsinline onmouseover="this.play()" onmouseout="this.pause()"></video>
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

        // Notify Telegram
        const msg = `💳 *YÊU CẦU NẠP COIN MỚI*\n👤 Khách: ${currentUser.displayName}\n📧 Email: ${currentUser.email}\n📦 Gói: ${selectedTopupPackage.name}\n💰 Số tiền: ${selectedTopupPackage.price}\n🪙 Coin nhận: ${selectedTopupPackage.coins}\n📝 Nội dung: \`${transferContent}\``;
        sendTelegramMessage(msg);
    } catch (err) {
        console.error("Lỗi khi tạo bản ghi nạp tiền:", err);
        // Vẫn tiếp tục hiện QR cho khách, Admin có thể check tay nếu lỗi DB
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
            if (!currentUser) return showToast(t('common.error_auth', { msg: "F5" }));

            const { db, doc, collection, runTransaction, serverTimestamp } = window.firebase;
            const submitBtn = document.getElementById('order-submit-btn');
            const progressDiv = document.getElementById('upload-progress');

            try {
                const modelKey = document.querySelector('input[name="model-type"]:checked').value;
                const serviceType = document.querySelector('input[name="service-type"]:checked').value;
                const model = MODELS[modelKey];

                const charFile = document.getElementById('file-char').files[0];
                const videoFile = document.getElementById('file-video').files[0];
                const templateUrl = document.getElementById('selected-template-url').value;

                if (!charFile) return showToast(t('modals.char_placeholder'));
                if (window.currentVideoSource === 'upload' && !videoFile) return showToast(t('modals.video_placeholder'));
                if (window.currentVideoSource === 'library' && !templateUrl) return showToast(t('modals.video_placeholder'));

                // Kiểm tra lại lần cuối trước khi upload
                if (charFile.size > 10 * 1024 * 1024) return showToast(t('modals.char_note'));

                // Show loading
                submitBtn.disabled = true;
                submitBtn.innerText = t('common.loading');
                progressDiv.style.display = 'block';

                // 1. Check coins first (Transaction)
                // 1. Check coins first (Transaction)
                const userRef = doc(db, "users", currentUser.uid);
                const userSnap = await runTransaction(db, async (transaction) => {
                    const userDoc = await transaction.get(userRef);
                    const currentCoins = userDoc.data().coins || 0;
                    if (currentCoins < model.cost) {
                        throw t('modals.insufficient_coins_title');
                    }
                    return currentCoins;
                });

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
                            submitBtn.innerText = t('modals.uploading');
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

                                transaction.update(userRef, { coins: currentCoins - model.cost });

                                const orderRef = doc(collection(db, "orders"));
                                transaction.set(orderRef, {
                                    userId: currentUser.uid,
                                    userEmail: currentUser.email,
                                    userName: currentUser.displayName,
                                    packageName: model.name,
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
                            document.getElementById('order-form').reset();
                            document.getElementById('preview-char-container').innerHTML = '';
                            document.getElementById('preview-video-container').innerHTML = '';
                            showDashboard();
                            const serviceLabel = SERVICE_TYPE_MAP()[serviceType] || serviceType;
                            const msg = `🚀 *ĐƠN HÀNG MỚI: ${serviceLabel.toUpperCase()}*\n\n` +
                                `🆔 Mã đơn: #${orderId}\n` +
                                `👤 Khách: ${currentUser.displayName}\n` +
                                `📧 Email: ${currentUser.email}\n` +
                                `🔧 Dịch vụ: *${serviceLabel}*\n` +
                                `📦 Gói: ${model.name}\n` +
                                `💰 Chi phí: ${model.cost} Coin\n` +
                                `🖼 [Xem ảnh nhân vật](${charUrl})\n` +
                                `📹 [Xem video tham chiếu](${videoUrl})`;
                            sendTelegramMessage(msg);
                        } catch (err) {
                            console.error("Order Creation Error:", err);
                            showToast(t('common.error') + ": " + (err.message || err));
                        } finally {
                            submitBtn.disabled = false;
                            submitBtn.innerText = t('modals.submit_order', { cost: model.cost });
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
                submitBtn.innerText = t('modals.submit_order', { cost: model.cost });
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

    const grid = document.getElementById('my-orders-grid');
    const countText = document.getElementById('orders-count-text');

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

    let isFirstLoad = true;
    onSnapshot(q, (snapshot) => {
        if (!grid) return;

        // Detect changes for notifications
        if (!isFirstLoad) {
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
        isFirstLoad = false;
        
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
            const date = d.createdAt ? d.createdAt.toDate().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '...';
            const statusVN = STATUS_MAP()[d.status] || d.status;
            const isNew = d.createdAt && (Date.now() - d.createdAt.toDate().getTime() < 5 * 60 * 1000);
            const isCompleted = d.status === 'completed' || d.status === 'done';

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
                        ${(d.systemNote || d.adminNote) ? `<div class="order-system-note">💬 ${d.systemNote || d.adminNote}</div>` : ''}
                        <div class="order-footer">
                            <div class="order-cost-tag">
                                <svg style="width: 12px; height: 12px;" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" fill="url(#coin-gradient)" fill-opacity="0.2" stroke="url(#coin-gradient)" stroke-width="2"/>
                                    <path d="M12 6L17.2 9V15L12 18L6.8 15V9L12 6Z" fill="url(#coin-gradient)"/>
                                </svg>
                                <span>${d.costCoins}</span>
                            </div>
                            <button class="order-view-btn" onclick="event.stopPropagation(); window.openUserOrderDetail('${doc.id}')">${t('dashboard.action_view_details')}</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    });
}


function loadMyTopups() {
    const { db, collection, query, where, onSnapshot } = window.firebase;
    const q = query(
        collection(db, "topups"),
        where("userId", "==", currentUser.uid)
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

    let isFirstLoadTopup = true;
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('my-topups-list');

        // Detect changes for notifications
        if (!isFirstLoadTopup) {
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
        isFirstLoadTopup = false;
        if (snapshot.empty) {
            list.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity: 0.5; padding: 2rem;">${t('status.no_topups')}</td></tr>`;
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
                                <span class="status-badge status-${d.status}">${STATUS_MAP()[d.status] || d.status}</span>
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
                        <td>${d.packageName || ''} (${SERVICE_TYPE_MAP()[d.serviceType] || d.serviceType})</td>
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
                    <a href="${downloadUrl}" target="_blank" class="btn-primary" style="display:block; text-align:center; padding: 12px; margin-top: 8px; text-decoration:none; width: 100%; font-weight: 600;">${t('modals.order_download')}</a>
                    <p style="font-size: 0.75rem; color: var(--danger); margin-top: 8px; text-align: center;">${t('modals.order_expiry_warn')}</p>
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
