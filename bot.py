import time
import os
import sys
import re
import base64
import argparse
import socket
import queue
import requests
import firebase_admin
import threading
from datetime import datetime, timezone
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from playwright.sync_api import sync_playwright
from aidancing_api import AidancingApiClient, SessionExpiredError

# --- CONFIGURATION ---
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# T?n bot: b?t bu?c khi ch?y ? python bot.py --name aidancing-vps1
BOT_NAME = None
bot_enabled = False
bot_enabled_lock = threading.Lock()

def is_bot_enabled():
    with bot_enabled_lock:
        return bot_enabled

def set_bot_enabled(value):
    global bot_enabled
    with bot_enabled_lock:
        bot_enabled = bool(value)

# CREATE_URL ?? ???c chuy?n th?nh dynamic theo modelId trong ??n h?ng
AIDANCING_ORIGIN = "https://aidancing.net"
DASHBOARD_URL = f"{AIDANCING_ORIGIN}/dashboard"
WORKER_URL = "https://motionai-upload-api.traderfinn0312.workers.dev"
BOT_CHROME_PROFILE = os.path.abspath(os.environ.get("BOT_CHROME_PROFILE", "bot_chrome_profile"))

browser_lock = threading.Lock()
_pending_order_queue = []
_pending_queue_lock = threading.Lock()
_pending_worker_started = False
_submitting_orders = set()
_submitting_orders_lock = threading.Lock()
MIN_RENDER_SEC = int(os.environ.get("BOT_MIN_RENDER_SEC", "600"))
_processing_cache = {}
_processing_cache_lock = threading.Lock()
HEARTBEAT_SEC = int(os.environ.get("BOT_HEARTBEAT_SEC", "60"))


def _pop_processing_cache(order_id):
    with _processing_cache_lock:
        _processing_cache.pop(order_id, None)


def _order_already_completed(order_id):
    """Re-fetch Firestore ? tr?nh ho?n ??n / spam Telegram l?p."""
    try:
        snap = db.collection('orders').document(order_id).get()
        if not snap.exists:
            return True
        d = snap.to_dict() or {}
        return d.get('status') == 'completed' or bool(d.get('resultLink'))
    except Exception as e:
        print(f"?? Kh?ng ??c ???c ??n {order_id}: {e}")
        return False


def _skip_if_order_done(order_id, reason):
    if _order_already_completed(order_id):
        print(f"?? B? qua ??n {order_id} ? {reason}")
        _pop_processing_cache(order_id)
        return True
    return False


_http_client = None
_http_client_lock = threading.Lock()

_pw_queue = queue.Queue()
_pw_worker_started = False
_pw_worker_lock = threading.Lock()
_pw_worker_tid = None


def _ensure_playwright_worker():
    global _pw_worker_started
    with _pw_worker_lock:
        if _pw_worker_started:
            return
        _pw_worker_started = True
        threading.Thread(
            target=_playwright_worker_loop,
            daemon=True,
            name="playwright-worker",
        ).start()


def _playwright_worker_loop():
    global _pw_worker_tid
    _pw_worker_tid = threading.get_ident()
    while True:
        fn, args, kwargs, done = _pw_queue.get()
        try:
            done["result"] = fn(*args, **kwargs)
        except Exception as e:
            done["error"] = e
        finally:
            done["event"].set()


def run_playwright(fn, *args, **kwargs):
    """Playwright sync API ch? ch?y tr?n 1 thread ? g?i h?m n?y t? thread kh?c."""
    if _pw_worker_tid == threading.get_ident():
        return fn(*args, **kwargs)
    _ensure_playwright_worker()
    done = {"event": threading.Event(), "result": None, "error": None}
    _pw_queue.put((fn, args, kwargs, done))
    done["event"].wait()
    if done["error"] is not None:
        raise done["error"]
    return done["result"]


def _get_http_client():
    global _http_client
    with _http_client_lock:
        if _http_client is None:
            _http_client = AidancingApiClient()
        return _http_client


def _reset_http_client():
    global _http_client
    with _http_client_lock:
        _http_client = None


def _http_create_job(model_id, char_path, vid_path):
    api = _get_http_client()
    return api.create_job(model_id, char_path, vid_path)


def _http_poll_orders(orders_to_check):
    api = _get_http_client()
    job_ids = [str(doc.to_dict().get('aidancingJobId')) for doc in orders_to_check]
    jobs_map = api.find_jobs_by_ids(job_ids)
    for doc in orders_to_check:
        job_id = str(doc.to_dict().get('aidancingJobId'))
        print(f"?? API ? Job {job_id}...")
        job = jobs_map.get(int(job_id))
        if not job:
            print(f"? Kh?ng th?y job {job_id} trong API (3 trang ??u)")
            continue
        status = (job.get('status') or '').upper()
        print(f"   status={status}, outputFileId={job.get('outputFileId')}")
        if status == 'COMPLETED' and job.get('outputFileId'):
            if _skip_if_order_done(doc.id, "?? completed tr?n Firestore"):
                continue
            print(f"?? Job {job_id} HO?N T?T ? t?i file {job['outputFileId']}...")
            try:
                local_vid = api.download_file(job['outputFileId'], f"res_{doc.id}.mp4")
                _complete_order_with_video(doc, local_vid)
            except Exception as e:
                print(f"?? L?i t?i/ho?n ??n {doc.id}: {e}")
        elif status in ('FAILED', 'ERROR', 'CANCELLED'):
            print(f"? Job {job_id} th?t b?i tr?n aidancing ({status})")
            order_data = doc.to_dict()
            err_detail = f'Aidancing job {job_id} {status}: {job.get("errorMessage") or ""}'
            notify_internal_error_telegram(doc.id, order_data, err_detail, 'render aidancing')
            cost_coins = order_data.get('costCoins', 0)
            user_id = order_data.get('userId')
            if cost_coins > 0 and user_id:
                try:
                    db.collection('users').document(user_id).update({'coins': firestore.Increment(cost_coins)})
                except Exception as e:
                    print(f"?? Ho?n coin l?i: {e}")
            db.collection('orders').document(doc.id).update({
                'status': 'failed',
                'adminNote': firestore.DELETE_FIELD,
                'systemNote': '??n h?ng x? l? kh?ng th?nh c?ng, h? th?ng ?? ho?n l?i coin.',
                'updatedAt': firestore.SERVER_TIMESTAMP
            })
            _pop_processing_cache(doc.id)
        else:
            print(f"? Job {job_id} v?n {status}")


def _processing_monitor_state():
    """??c t? RAM ? kh?ng query Firestore m?i l?n poll."""
    now = datetime.now(timezone.utc)
    eligible = []
    with _processing_cache_lock:
        stale_ids = []
        for oid, doc in _processing_cache.items():
            d = doc.to_dict() or {}
            if d.get('status') != 'processing':
                stale_ids.append(oid)
        for oid in stale_ids:
            _processing_cache.pop(oid, None)
        processing_count = len(_processing_cache)
        for doc in _processing_cache.values():
            d = doc.to_dict() or {}
            if d.get('status') != 'processing':
                continue
            job_id = d.get('aidancingJobId')
            submitted_at = d.get('submittedAt')
            if not job_id or job_id == "MANUAL":
                continue
            if submitted_at:
                if (now - submitted_at).total_seconds() > MIN_RENDER_SEC:
                    eligible.append(doc)
            else:
                eligible.append(doc)
    return eligible, processing_count


def on_processing_orders_snapshot(keys, changes, read_time):
    """Listener: ch? read Firestore khi ??n v?o/ra kh?i processing (kh?ng poll l?p)."""
    with _processing_cache_lock:
        for ch in changes:
            doc = ch.document
            oid = doc.id
            if ch.type.name == 'REMOVED':
                _processing_cache.pop(oid, None)
                continue
            d = doc.to_dict() or {}
            if d.get('status') == 'processing':
                _processing_cache[oid] = doc
            else:
                _processing_cache.pop(oid, None)


def start_processing_listener():
    db.collection('orders').where(
        filter=FieldFilter("status", "==", "processing")
    ).on_snapshot(on_processing_orders_snapshot)
    print("?? Listener processing orders ? cache RAM, kh?ng query Firestore m?i l?n poll")


def _monitor_sleep_seconds(eligible_count, processing_count):
    """Kh?ng c? webhook aidancing ? ch? poll; interval d?i khi kh?ng c? vi?c."""
    idle = int(os.environ.get("BOT_POLL_IDLE_SEC", "300"))
    wait_render = int(os.environ.get("BOT_POLL_WAIT_RENDER_SEC", "120"))
    active = int(os.environ.get("BOT_POLL_ACTIVE_SEC", "90"))
    if processing_count == 0:
        return idle
    if eligible_count == 0:
        return wait_render
    return active


def ensure_cdp_available(cdp_url, timeout=3):
    try:
        url = cdp_url.rstrip("/") + "/json/version"
        requests.get(url, timeout=timeout)
        return True
    except Exception:
        return False

def _cdp_not_running_error(cdp_url):
    return RuntimeError(
        f"Chrome CDP ch?a ch?y t?i {cdp_url}. "
        "M? Chrome ? terminal RI?NG v? GI? ch?y (??ng Ctrl+C), r?i ch?y bot:\n"
        "  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\\n"
        "    --remote-debugging-port=9222 --remote-allow-origins='*' \\\n"
        "    --user-data-dir=\"$HOME/.chrome-aidancing-motionai\" \\\n"
        "    --profile-directory=\"Profile 4\""
    )

def _ensure_pending_worker():
    global _pending_worker_started
    with _pending_queue_lock:
        if _pending_worker_started:
            return
        _pending_worker_started = True
        threading.Thread(target=_pending_order_worker, daemon=True).start()

def _pending_order_worker():
    while True:
        order_id = None
        with _pending_queue_lock:
            if _pending_order_queue:
                order_id = _pending_order_queue.pop(0)
        if order_id:
            submit_to_aidancing(order_id)
        else:
            time.sleep(0.5)

AIDANCING_BLOCKED_MARKERS = (
    "b?o tr?", "bao tri", "maintenance", "under maintenance",
    "scheduled maintenance", "h? th?ng ?ang", "temporarily unavailable",
    "service unavailable", "coming soon",
)

STEALTH_INIT_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
window.chrome = window.chrome || { runtime: {}, loadTimes: function() {}, csi: function() {} };
Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) =>
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters);
"""

class AidancingBrowserSession:
    """Wrapper: CDP mode kh?ng ??ng Chrome c?a user khi bot xong."""

    def __init__(self, context, close_context_on_exit=True):
        self.context = context
        self.close_context_on_exit = close_context_on_exit
        self._pages = []

    def new_page(self):
        page = self.context.new_page()
        self._pages.append(page)
        return page

    def cookies(self, urls=None):
        if urls:
            return self.context.cookies(urls)
        return self.context.cookies()

    def clear_cookies(self):
        self.context.clear_cookies()

    def close(self):
        for page in self._pages:
            try:
                page.close()
            except Exception:
                pass
        self._pages.clear()
        if self.close_context_on_exit:
            try:
                self.context.close()
            except Exception:
                pass

def close_extra_aidancing_tabs(session, keep_page):
    """??ng tab aidancing ph? (do n?t T?i m? target=_blank)."""
    for p in list(session.context.pages):
        if p == keep_page:
            continue
        try:
            u = p.url or ''
            if 'aidancing' in u or u.startswith('blob:') or 'proxy/files' in u:
                p.close()
        except Exception:
            pass

def _apply_stealth(context):
    try:
        context.add_init_script(STEALTH_INIT_SCRIPT)
    except Exception as e:
        print(f"?? Kh?ng g?n stealth script: {e}")

def _aidancing_chrome_args():
    args = [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
    ]
    if os.environ.get("BOT_CHROME_OFFSCREEN", "0") == "1":
        args.append("--window-position=-2400,-2400")
    return args

def _chrome_profile_dir():
    return os.path.abspath(os.environ.get("BOT_CHROME_PROFILE", BOT_CHROME_PROFILE))

def launch_aidancing_browser(playwright):
    cdp_url = os.environ.get("BOT_CDP_URL", "").strip()
    if cdp_url:
        if not ensure_cdp_available(cdp_url):
            raise _cdp_not_running_error(cdp_url)
        browser = playwright.chromium.connect_over_cdp(cdp_url)
        context = browser.contexts[0] if browser.contexts else browser.new_context(
            locale="vi-VN",
            timezone_id="Asia/Ho_Chi_Minh",
            viewport={"width": 1280, "height": 800},
        )
        _apply_stealth(context)
        print(f"?? N?i Chrome qua CDP ({cdp_url}) ? d?ng Chrome th?t, kh?ng ??ng khi bot xong.")
        return AidancingBrowserSession(context, close_context_on_exit=False)

    profile_dir = _chrome_profile_dir()
    kwargs = dict(
        user_data_dir=profile_dir,
        headless=False,
        slow_mo=int(os.environ.get("BOT_SLOW_MO", "500")),
        ignore_default_args=["--enable-automation"],
        args=_aidancing_chrome_args(),
        viewport={"width": 1280, "height": 800},
        locale="vi-VN",
        timezone_id="Asia/Ho_Chi_Minh",
    )
    try:
        context = playwright.chromium.launch_persistent_context(channel="chrome", **kwargs)
    except Exception as e:
        print(f"?? Kh?ng m? ???c Chrome ({e}), d?ng Chromium bundled...")
        context = playwright.chromium.launch_persistent_context(**kwargs)
    _apply_stealth(context)
    return AidancingBrowserSession(context, close_context_on_exit=True)

def _aidancing_page_info(page):
    try:
        return f"{page.url} | {page.title()}"
    except Exception:
        return page.url

def is_aidancing_blocked(page):
    try:
        url = (page.url or "").lower()
        if any(x in url for x in ("maintenance", "maintain", "bao-tri")):
            return True
        combined = f"{page.title() or ''} {page.content()}".lower()
        return any(marker in combined for marker in AIDANCING_BLOCKED_MARKERS)
    except Exception:
        return False

def _raise_if_aidancing_blocked(page):
    if not is_aidancing_blocked(page):
        return
    print(f"?? Aidancing ch?n/trang b?o tr?: {_aidancing_page_info(page)}")
    raise RuntimeError(
        "Aidancing hi?n th? trang b?o tr? ho?c ch?n tr?nh duy?t t? ??ng. "
        "Th??ng do profile Chrome BOT ch?a c? cookie ??ng nh?p (Chrome th??ng c?a b?n v?n v?o ???c v? ?? login). "
        "C?ch x? l?: tho?t h?t Chrome (Cmd+Q), copy profile Default ?? login sang ~/.chrome-aidancing-bot "
        "(xem README ho?c h??ng d?n setup), m? Chrome CDP r?i BOT_CDP_URL=http://127.0.0.1:9222 python3 bot.py --name mac --mode api"
    )

def _aidancing_on_dashboard(page):
    u = page.url.lower()
    if "login" in u or "signin" in u or "sign-in" in u:
        return False
    if is_aidancing_blocked(page):
        return False
    return "dashboard" in u

def goto_aidancing_dashboard(page, session, login_wait_sec=120):
    """M? dashboard; x? l? redirect loop (cookie h?ng) v? ch? ??ng nh?p th? c?ng."""

    def _goto(url):
        page.goto(url, timeout=60000, wait_until="domcontentloaded")
        print(f"?? {_aidancing_page_info(page)}")
        _raise_if_aidancing_blocked(page)

    try:
        _goto(DASHBOARD_URL)
    except Exception as e:
        err = str(e)
        if "Aidancing hi?n th?" in err:
            raise
        if "ERR_TOO_MANY_REDIRECTS" in err or "too many redirects" in err.lower():
            print("?? Redirect loop ? x?a cookie profile bot v? th? l?i...")
            try:
                session.clear_cookies()
            except Exception as ce:
                print(f"   (kh?ng x?a ???c cookie: {ce})")
            _goto(AIDANCING_ORIGIN)
            page.wait_for_timeout(2000)
            _goto(DASHBOARD_URL)
        else:
            raise

    page.wait_for_timeout(2000)
    if _aidancing_on_dashboard(page):
        return

    print(f"?? Ch?a v?o Dashboard (URL: {page.url})")
    print("?? ??ng nh?p aidancing.net tr?n c?a s? Chrome BOT (th? m?c bot_chrome_profile).")
    print("   Chrome th??ng c?a b?n d?ng profile kh?c ? c?n login 1 l?n tr?n c?a s? bot.")

    deadline = time.time() + login_wait_sec
    while time.time() < deadline:
        page.wait_for_timeout(3000)
        if _aidancing_on_dashboard(page):
            print("? ?? v?o Dashboard sau khi ??ng nh?p.")
            return
        try:
            _goto(DASHBOARD_URL)
        except Exception as e:
            if "Aidancing hi?n th?" in str(e):
                raise

    raise RuntimeError(
        f"Kh?ng v?o ???c Dashboard sau {login_wait_sec}s. "
        f"??ng nh?p tr?n c?a s? Chrome bot r?i ch?y l?i. URL: {page.url}"
    )

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8676046240:AAE14lDxAj9otGTjVnd8Smr2__Wg-J2dCLc")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "6067707939")
AIDANCING_LOW_BALANCE_THRESHOLD = 10

def normalize_bot_name(name):
    name = (name or '').strip().lower()
    name = re.sub(r'[^a-z0-9_-]', '-', name)
    name = re.sub(r'-+', '-', name).strip('-')
    return name[:64]

def ensure_bot_registered():
    ref = db.collection('bots').document(BOT_NAME)
    doc = ref.get()
    now = firestore.SERVER_TIMESTAMP
    if not doc.exists:
        ref.set({
            'name': BOT_NAME,
            'displayName': BOT_NAME,
            'enabled': False,
            'hostname': socket.gethostname(),
            'createdAt': now,
            'lastSeenAt': now,
            'startedAt': now,
        })
        print(f"?? Bot m?i ??ng k? tr?n Firestore: {BOT_NAME} (m?c ??nh T?T ? b?t tr?n Admin)")
    else:
        ref.set({
            'name': BOT_NAME,
            'lastSeenAt': now,
            'startedAt': now,
            'hostname': socket.gethostname(),
        }, merge=True)

def bot_heartbeat_loop():
    while True:
        try:
            if BOT_NAME:
                ref = db.collection('bots').document(BOT_NAME)
                try:
                    ref.update({'lastSeenAt': firestore.SERVER_TIMESTAMP})
                except Exception as e:
                    # Doc b? admin x?a ? ??ng k? l?i ??y ?? (c?ng t?n = c?ng 1 bot)
                    if 'NOT_FOUND' in str(e) or 'No document to update' in str(e):
                        ensure_bot_registered()
                    else:
                        raise
        except Exception as e:
            print(f"?? Heartbeat l?i: {e}")
        time.sleep(HEARTBEAT_SEC)

def on_bot_config_snapshot(keys, changes, read_time):
    # Document watch callback: (sorted_keys, DocumentChange[], read_time) ? not a DocumentSnapshot.
    if not changes:
        return
    enabled = False
    for change in changes:
        doc = change.document
        if getattr(doc, 'exists', False):
            enabled = bool((doc.to_dict() or {}).get('enabled', False))
        break
    prev = is_bot_enabled()
    set_bot_enabled(enabled)
    if enabled != prev:
        status = "?? B?T ? bot ?ang x? l? ??n" if enabled else "?? T?T ? bot kh?ng l?m g?"
        print(f"\n[{BOT_NAME}] Admin ??i tr?ng th?i: {status}\n")

def start_bot_control_listener():
    ensure_bot_registered()
    doc = db.collection('bots').document(BOT_NAME).get()
    set_bot_enabled(bool(doc.to_dict().get('enabled', False)) if doc.exists else False)
    status = "?? B?T" if is_bot_enabled() else "?? T?T"
    print(f"[{BOT_NAME}] Tr?ng th?i hi?n t?i: {status}")
    if not is_bot_enabled():
        print("??  Bot ?ang T?T. V?o Admin ? Bots ?? b?t.")

    db.collection('bots').document(BOT_NAME).on_snapshot(on_bot_config_snapshot)
    threading.Thread(target=bot_heartbeat_loop, daemon=True).start()

def send_telegram_message(text):
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "HTML"
        }
        res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=10)
        if res.status_code != 200:
            print(f"? L?i g?i tin nh?n Telegram: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"? L?i k?t n?i g?i Telegram: {e}")

_INTERNAL_ERROR_MARKERS = (
    'aidancing', '/api/proxy/', 'proxy/jobs', 'proxy/files',
    '401', '503', '502', '429', '??ng nh?p l?i', 'b?o tr?',
    'chrome cdp', 'connect_over_cdp', 'econnrefused', 'target closed',
    'different thread', 'job id aidancing', 'dashboard', 'create/general',
    'bot n?p', 'maintenance',
)
_ERROR_TELEGRAM_COOLDOWN = 900
_error_telegram_sent = {}
_error_telegram_lock = threading.Lock()
_session_error_backoff = {}
SESSION_ERROR_BACKOFF_SEC = 300

def is_internal_bot_error(err):
    s = (err or '').lower()
    return any(m in s for m in _INTERNAL_ERROR_MARKERS)

def notify_internal_error_telegram(order_id, order_data, err, context=''):
    now = time.time()
    with _error_telegram_lock:
        last = _error_telegram_sent.get(order_id, 0)
        if now - last < _ERROR_TELEGRAM_COOLDOWN:
            return
        _error_telegram_sent[order_id] = now
    short_id = order_id[-6:].upper()
    user_name = (order_data or {}).get('userName', 'Kh?ch h?ng')
    user_email = (order_data or {}).get('userEmail', 'N/A')
    ctx = f" ({context})" if context else ""
    err_text = (err or '')[:500]
    msg = (
        f"?? <b>[MotionAI] BOT L?I N?I B?{ctx}</b>\n\n"
        f"?? M? ??n: #{short_id}\n"
        f"?? Kh?ch: {user_name}\n"
        f"?? Email: {user_email}\n"
        f"?? Chi ti?t:\n<code>{err_text}</code>"
    )
    send_telegram_message(msg)

def apply_bot_error_update(doc_ref, order_id, order_data, err, context='n?p ??n'):
    """L?i Aidancing/h? t?ng bot ? Telegram admin, kh?ng hi?n adminNote cho kh?ch."""
    if is_internal_bot_error(err):
        notify_internal_error_telegram(order_id, order_data, err, context)
        _session_error_backoff[order_id] = time.time() + SESSION_ERROR_BACKOFF_SEC
        return True
    doc_ref.update({
        'adminNote': f"Bot n?p l?i: {err}",
        'updatedAt': firestore.SERVER_TIMESTAMP,
    })
    return False

def _pending_submit_backoff_active(order_id):
    return time.time() < _session_error_backoff.get(order_id, 0)

def scrape_aidancing_balance(page):
    """??c s? coin c?n l?i tr?n header aidancing.net (vd: 101.0)."""
    try:
        val = page.evaluate('''() => {
            const pick = (s) => {
                const m = String(s).trim().match(/^(\\d+(?:\\.\\d+)?)$/);
                return m ? parseFloat(m[1]) : null;
            };
            const scopes = document.querySelectorAll('header *, nav *, [class*="wallet"], [class*="balance"], [class*="coin"]');
            for (const el of scopes) {
                if (el.children.length > 0) continue;
                const v = pick(el.textContent);
                if (v !== null && v >= 0 && v < 100000) return v;
            }
            return null;
        }''')
        if val is not None:
            return float(val)
    except Exception as e:
        print(f"?? Kh?ng ??c ???c balance aidancing: {e}")
    return None

def alert_low_aidancing_balance(balance, extra=''):
    if balance is None or balance >= AIDANCING_LOW_BALANCE_THRESHOLD:
        return
    msg = (
        f"???? <b>C?NH B?O KH?N ? S?P H?T COIN AIDANCING!</b>\n\n"
        f"?? S? d? aidancing.net: <b>{balance}</b> Coin\n"
        f"?? D??i ng??ng {AIDANCING_LOW_BALANCE_THRESHOLD} Coin ? "
        f"<b>n?p g?p</b> tr??c khi bot kh?ng t?o ???c ??n!\n"
        f"{extra}"
    )
    send_telegram_message(msg)

def download_file(url, filename, cookies=None, referer=None, retries=2):
    print(f"?? T?i file (requests): {filename}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer or f'{AIDANCING_ORIGIN}/dashboard',
        'Origin': AIDANCING_ORIGIN,
    }
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(url, headers=headers, cookies=cookies, timeout=120)
            if response.status_code in (503, 502, 429) and attempt < retries:
                wait = 5 * attempt
                print(f"?? HTTP {response.status_code} ? th? l?i {attempt}/{retries} sau {wait}s...")
                time.sleep(wait)
                continue
            response.raise_for_status()
            with open(filename, 'wb') as f:
                f.write(response.content)
            return os.path.abspath(filename)
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(3 * attempt)
    print(f"? L?i t?i file: {last_err}")
    return None

def download_aidancing_result(session, page, url, filename, download_locator=None):
    """T?i video k?t qu? aidancing ? kh?ng click m? tab (aidancing d?ng target=_blank)."""
    print(f"?? T?i k?t qu? aidancing: {filename}...")
    if not url.startswith('http'):
        url = AIDANCING_ORIGIN + url

    def save_bytes(data):
        with open(filename, 'wb') as f:
            f.write(data)
        return os.path.abspath(filename)

    def session_get(target_url, label):
        try:
            resp = session.context.request.get(
                target_url,
                headers={'Referer': DASHBOARD_URL, 'Origin': AIDANCING_ORIGIN},
                timeout=120000,
            )
            if resp.ok:
                save_bytes(resp.body())
                print(f"? {label}")
                return os.path.abspath(filename)
            print(f"?? {label} ? HTTP {resp.status}")
        except Exception as e:
            print(f"?? {label} ? {e}")
        return None

    # 1) T?i th?ng URL proxy/API ? kh?ng click (tr?nh m? tab m?i)
    result = session_get(url, "T?i direct URL (session cookie)")
    if result:
        return result

    # 2) fetch() ngay tr?n dashboard (credentials: include)
    try:
        data = page.evaluate('''async (videoUrl) => {
            const r = await fetch(videoUrl, { credentials: 'include' });
            if (!r.ok) return { ok: false, status: r.status };
            const buf = await r.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return { ok: true, b64: btoa(binary) };
        }''', url)
        if data and data.get('ok') and data.get('b64'):
            save_bytes(base64.b64decode(data['b64']))
            print("? T?i qua fetch in-page")
            return os.path.abspath(filename)
        if data:
            print(f"?? In-page fetch HTTP {data.get('status')}")
    except Exception as e:
        print(f"?? In-page fetch l?i: {e}")

    # 3) N?t T?i m? tab video m?i (target=_blank) ? b?t tab, l?y src, ??ng tab
    if download_locator is not None and download_locator.count() > 0:
        new_page = None
        try:
            print("??? N?t T?i m? tab m?i ? b?t tab video...")
            with session.context.expect_page(timeout=30000) as page_info:
                download_locator.click()
            new_page = page_info.value
            new_page.wait_for_load_state('domcontentloaded', timeout=30000)
            new_page.wait_for_timeout(1500)
            video_url = new_page.evaluate('''() => {
                const v = document.querySelector('video');
                if (v) {
                    const s = v.querySelector('source');
                    const src = (s && s.src) || v.src || v.currentSrc || '';
                    if (src) return src;
                }
                return location.href;
            }''')
            if video_url and not video_url.startswith('http'):
                video_url = AIDANCING_ORIGIN + video_url
            if video_url:
                print(f"?? URL tab video: {video_url[:100]}...")
                result = session_get(video_url, "T?i t? tab video")
                if result:
                    return result
                result = session_get(url, "T?i l?i URL g?c sau tab")
                if result:
                    return result
        except Exception as e:
            print(f"?? X? l? tab video: {e}")
        finally:
            if new_page:
                try:
                    new_page.close()
                except Exception:
                    pass
            close_extra_aidancing_tabs(session, page)

    # 4) Fallback requests + cookie
    try:
        cookie_list = session.cookies(urls=[AIDANCING_ORIGIN, f"{AIDANCING_ORIGIN}/"])
        jar = {c['name']: c['value'] for c in cookie_list}
    except Exception:
        jar = {c['name']: c['value'] for c in session.cookies()}
    return download_file(url, filename, cookies=jar, referer=DASHBOARD_URL, retries=3)

def upload_to_r2(file_path, folder="results"):
    print(f"?? ?ang upload l?n R2...")
    try:
        file_name = f"{folder}/{int(time.time() * 1000)}_{os.path.basename(file_path)}"
        url = f"{WORKER_URL}/?file={requests.utils.quote(file_name)}&t={int(time.time() * 1000)}"
        with open(file_path, 'rb') as f:
            response = requests.post(url, data=f, headers={'Content-Type': 'video/mp4'}, timeout=120)
            if response.status_code == 200:
                return response.json().get('url')
    except Exception as e:
        print(f"? L?i R2: {e}")
    return None

def send_completion_email(order_id, order_data, result_link):
    user_email = order_data.get('userEmail')
    user_name = order_data.get('userName', 'Kh?ch h?ng')
    service_type = order_data.get('serviceType', 'copy-motion-photo')
    
    if not user_email:
        print("?? Kh?ng t?m th?y Email c?a kh?ch ?? g?i th?ng b?o ho?n th?nh ??n.")
        return
        
    print(f"?? ?ang g?i email th?ng b?o ho?n th?nh ??n t?i: {user_email}...")
    
    # ?nh x? t?n d?ch v? ti?ng Vi?t
    service_label = service_type
    if service_type == 'copy-motion-photo':
        service_label = "AI Copy Chuy?n ??ng V?o ?nh (20s)"
    elif service_type == 'copy-motion-multi':
        service_label = "AI Copy Nh?y Nhi?u Ng??i"
    elif service_type == 'char-to-video-fashion':
        service_label = "AI Copy Th?i Trang"
    elif service_type == 'char-to-video-ads':
        service_label = "AI Copy S?n Ph?m"

    short_order_id = order_id[-6:].upper()
    
    payload = {
        "service_id": "service_6r6rd2q",
        "template_id": "template_09eir3r",
        "user_id": "92pP97oTzMGR4p_Zp",
        "template_params": {
            "user_name": user_name,
            "user_email": user_email,
            "order_id": short_order_id,
            "result_link": result_link,
            "service_label": service_label
        }
    }
    
    try:
        url = "https://api.emailjs.com/api/v1.0/email/send"
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=15)
        if response.status_code == 200 or response.text == "OK":
            print(f"? G?i email th?ng b?o qua EmailJS th?nh c?ng!")
        else:
            print(f"? L?i g?i email qua EmailJS: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"? L?i k?t n?i khi g?i email th?ng b?o qua EmailJS: {e}")

def use_api_mode():
    """Pure HTTP ? kh?ng c?n Chrome/Playwright (cookie AIDANCING_COOKIE)."""
    return os.environ.get("BOT_MODE", "browser").strip().lower() in ("api", "http")

def _complete_order_with_video(doc, local_vid):
    """Upload R2 + c?p nh?t Firestore + th?ng b?o."""
    order_id = doc.id
    if _order_already_completed(order_id):
        print(f"?? ??n {order_id} ?? completed ? kh?ng g?i l?i Telegram/R2")
        _pop_processing_cache(order_id)
        if os.path.exists(local_vid):
            os.remove(local_vid)
        return True
    r2_url = upload_to_r2(local_vid)
    if not r2_url:
        return False
    db.collection('orders').document(doc.id).update({
        'status': 'completed',
        'resultLink': r2_url,
        'updatedAt': firestore.SERVER_TIMESTAMP
    })
    print(f"[OK] DA TRA HANG CHO DON {doc.id}")
    try:
        order_data = doc.to_dict()
        short_id = doc.id[-6:].upper()
        user_name = order_data.get('userName', 'Khach hang')
        user_email = order_data.get('userEmail', 'N/A')
        char_img = order_data.get('characterImageLink', '')
        msg = (
            f"<b>DON HANG HOAN THANH</b>\n\n"
            f"Ma don: #{short_id}\n"
            f"Khach: {user_name}\n"
            f"Email: {user_email}\n"
        )
        if char_img:
            msg += f"Anh dau vao: <a href=\"{char_img}\">Xem anh goc</a>\n"
        msg += f"Ket qua: <a href=\"{r2_url}\">Xem video</a>"
        send_telegram_message(msg)
    except Exception as tele_err:
        print(f"[WARN] Loi gui Telegram hoan thanh: {tele_err}")
    try:
        send_completion_email(doc.id, doc.to_dict(), r2_url)
    except Exception as mail_err:
        print(f"?? Kh?ng g?i ???c email th?ng b?o: {mail_err}")
    if os.path.exists(local_vid):
        os.remove(local_vid)
    _pop_processing_cache(order_id)
    return True

def check_finished_orders_api():
    """Monitor qua GET /api/proxy/jobs ? Pure HTTP, poll m?i BOT_POLL_* gi?y."""
    if not is_bot_enabled() or browser_lock.locked():
        return
    orders_to_check, _ = _processing_monitor_state()
    if not orders_to_check:
        return

    print(f"\n?? [MONITOR/HTTP] Poll {len(orders_to_check)} ??n...")
    with browser_lock:
        try:
            _http_poll_orders(orders_to_check)
        except SessionExpiredError as e:
            print(f"? Session h?t h?n: {e}")
            _reset_http_client()
        except Exception as e:
            err = str(e)
            print(f"? L?i monitor HTTP: {e}")
            if any(x in err.lower() for x in ('401', '403', 'session expired', 'aidancing_cookie')):
                _reset_http_client()

def _mark_order_processing(doc_ref, job_id):
    """Ch? chuy?n processing sau khi aidancing ?? nh?n job."""
    doc_ref.update({
        'status': 'processing',
        'aidancingJobId': str(job_id),
        'submittedAt': firestore.SERVER_TIMESTAMP,
        'updatedAt': firestore.SERVER_TIMESTAMP,
    })


def submit_to_aidancing(order_id):
    if not is_bot_enabled():
        print(f"?? [{BOT_NAME}] Bot T?T ? b? qua n?p ??n {order_id}")
        return
    if _pending_submit_backoff_active(order_id):
        return
    with _submitting_orders_lock:
        if order_id in _submitting_orders:
            print(f"?? [{BOT_NAME}] ??n {order_id} ?ang n?p ? b? qua tr?ng l?p")
            return
        _submitting_orders.add(order_id)
    try:
        with browser_lock:
            doc_ref = db.collection('orders').document(order_id)
            doc = doc_ref.get()
            if not doc.exists:
                return
            data = doc.to_dict()
            if data.get('status') != 'pending':
                return

            print(f"\n? [N?P ??N] {order_id}... (gi? pending cho ??n khi aidancing OK)")

            char_path = None
            vid_path = None

            # Th? t?i t?i ?a 2 l?n
            for attempt in range(1, 3):
                if attempt > 1: print(f"?? Th? l?i l?n {attempt}...")
                char_path = download_file(data.get('characterImageLink'), f"char_{order_id}.png")
                vid_path = download_file(data.get('referenceVideoLink'), f"vid_{order_id}.mp4")

                if char_path and vid_path:
                    break
                time.sleep(2)

            if not char_path or not vid_path:
                print(f"? Kh?ng th? t?i file sau 2 l?n th? cho ??n {order_id}")
                # Ho?n ti?n cho kh?ch
                cost_coins = data.get('costCoins', 0)
                user_id = data.get('userId')
                if cost_coins > 0 and user_id:
                    try:
                        db.collection('users').document(user_id).update({
                            'coins': firestore.Increment(cost_coins)
                        })
                        print(f"?? ?? ho?n l?i {cost_coins} coin cho user {user_id}")
                    except Exception as e:
                        print(f"?? L?i khi ho?n ti?n cho user {user_id}: {e}")

                doc_ref.update({
                    'status': 'failed',
                    'adminNote': '?nh ho?c video qu? kh?ch t?i l?n kh?ng t?n t?i, h? th?ng ?? ho?n l?i coin.',
                    'updatedAt': firestore.SERVER_TIMESTAMP
                })

                # G?i th?ng b?o Telegram: ??n h?ng th?t b?i
                try:
                    short_id = order_id[-6:].upper()
                    user_name = data.get('userName', 'Khach hang')
                    user_email = data.get('userEmail', 'N/A')
                    msg = (
                        f"<b>DON HANG THAT BAI</b>\n\n"
                        f"Ma don: #{short_id}\n"
                        f"Khach: {user_name}\n"
                        f"Email: {user_email}\n"
                        f"Ly do: Khong the tai anh/video nhan vat qua khach tai len."
                    )
                    send_telegram_message(msg)
                except Exception as tele_err:
                    print(f"[WARN] Loi gui Telegram that bai: {tele_err}")
                if char_path and os.path.exists(char_path): os.remove(char_path)
                if vid_path and os.path.exists(vid_path): os.remove(vid_path)
                return

            if use_api_mode():
                try:
                    model_id = data.get('modelId', '124')
                    print(f"?? [HTTP] N?p ??n model {model_id}...")
                    job_id = _http_create_job(model_id, char_path, vid_path)
                    print(f"?? [HTTP] Job m?i: {job_id}")
                    _mark_order_processing(doc_ref, job_id)
                    _session_error_backoff.pop(order_id, None)
                    print(f"? ??n {order_id} ? processing (aidancing ?? nh?n job)")
                    try:
                        short_id = order_id[-6:].upper()
                        msg = (
                            f"<b>DON HANG DANG XU LY</b>\n\n"
                            f"Ma don: #{short_id}\n"
                            f"Job ID aidancing: <code>{job_id}</code>\n"
                            f"Dang render (HTTP mode)..."
                        )
                        send_telegram_message(msg)
                    except Exception:
                        pass
                except SessionExpiredError as e:
                    print(f"? Session h?t h?n: {e}")
                    _reset_http_client()
                    apply_bot_error_update(doc_ref, order_id, data, str(e), 'n?p HTTP')
                except Exception as e:
                    print(f"? L?i n?p HTTP: {e}")
                    err = str(e)
                    if any(x in err.lower() for x in ('401', '403', 'session expired', 'aidancing_cookie')):
                        _reset_http_client()
                    apply_bot_error_update(doc_ref, order_id, data, err, 'n?p HTTP')
                finally:
                    if char_path and os.path.exists(char_path):
                        os.remove(char_path)
                    if vid_path and os.path.exists(vid_path):
                        os.remove(vid_path)
                return

            def _pw_browser_submit():
                with sync_playwright() as p:
                    browser = launch_aidancing_browser(p)
                    page = browser.new_page()
                    try:
                        print("?? ?ang ki?m tra danh s?ch Job c? tr?n Dashboard...")
                        goto_aidancing_dashboard(page, browser)
                        balance = scrape_aidancing_balance(page)
                        if balance is not None:
                            print(f"?? Aidancing balance: {balance} Coin")
                        if balance is not None and balance < AIDANCING_LOW_BALANCE_THRESHOLD:
                            short_id = order_id[-6:].upper()
                            user_name = data.get('userName', 'Kh?ch h?ng')
                            alert_low_aidancing_balance(
                                balance,
                                extra=f"\n?? Bot ?ang n?p ??n: #{short_id}\n?? Kh?ch: {user_name}"
                            )
                        old_job_ids = set(re.findall(r'\b\d{6}\b', page.content()))
                        print(f"?? ?? ghi nh?n {len(old_job_ids)} Job ID c?.")
                        model_id = data.get('modelId', '124')
                        create_url = f"{AIDANCING_ORIGIN}/create/general?id={model_id}"
                        print(f"?? V?o trang t?o: {create_url}")
                        page.goto(create_url, timeout=90000)
                        page.set_input_files('input[name="image"]', char_path)
                        page.set_input_files('input[name="video"]', vid_path)
                        page.locator('button.neon-ai-2').first.click()
                        print("? ??i chuy?n v? Dashboard v? qu?t Job ID m?i...")
                        page.wait_for_url("**/dashboard**", timeout=60000)
                        job_id = None
                        for _ in range(15):
                            page.wait_for_timeout(2000)
                            current_job_ids = set(re.findall(r'\b\d{6}\b', page.content()))
                            new_jobs = current_job_ids - old_job_ids
                            if new_jobs:
                                job_id = sorted(list(new_jobs))[-1]
                                break
                        if not job_id:
                            print("?? Kh?ng t?m th?y Job ID m?i sau 30s! D?ng c?ch l?y m?c ??nh...")
                            job_ids = re.findall(r'\b\d{6}\b', page.content())
                            if job_ids:
                                job_id = job_ids[0]
                                print(f"?? L?Y ???C JOB ID (Fallback): {job_id}")
                        return job_id
                    finally:
                        browser.close()

            try:
                job_id = run_playwright(_pw_browser_submit)
                if job_id:
                    print(f"?? L?Y ???C JOB ID M?I: {job_id}")
                    _mark_order_processing(doc_ref, job_id)
                    _session_error_backoff.pop(order_id, None)
                    print(f"? ??n {order_id} ? processing (aidancing ?? nh?n job)")
                    try:
                        short_id = order_id[-6:].upper()
                        user_name = data.get('userName', 'Khach hang')
                        user_email = data.get('userEmail', 'N/A')
                        msg = (
                            f"<b>DON HANG DANG XU LY</b>\n\n"
                            f"Ma don: #{short_id}\n"
                            f"Khach: {user_name}\n"
                            f"Email: {user_email}\n"
                            f"Job ID aidancing: <code>{job_id}</code>\n"
                            f"Dang render tren aidancing.net..."
                        )
                        send_telegram_message(msg)
                    except Exception as tele_err:
                        print(f"?? L?i g?i th?ng b?o Telegram x? l?: {tele_err}")
                else:
                    err = 'Bot n?p xong nh?ng kh?ng l?y ???c Job ID aidancing ? v?n pending, th? l?i sau.'
                    apply_bot_error_update(doc_ref, order_id, data, err, 'n?p browser')
            except Exception as e:
                print(f"? L?i n?p: {e}")
                apply_bot_error_update(doc_ref, order_id, data, str(e), 'n?p browser')
            finally:
                if os.path.exists(char_path):
                    os.remove(char_path)
                if os.path.exists(vid_path):
                    os.remove(vid_path)
    finally:
        with _submitting_orders_lock:
            _submitting_orders.discard(order_id)

# --- PHA 2: R?NH K?T QU? ---
def check_finished_orders():
    if use_api_mode():
        try:
            check_finished_orders_api()
        except Exception as e:
            print(f"? L?i monitor API: {e}")
        return
    if not is_bot_enabled():
        return
    try:
        # N?u ?ang n?p ??n th? kh?ng check dashboard ?? tr?nh kh?a profile
        if browser_lock.locked():
            return

        orders_to_check, _ = _processing_monitor_state()
        if not orders_to_check:
            return

        print(f"\n?? [MONITOR] ?ang r?nh k?t qu? cho {len(orders_to_check)} ??n ?? {MIN_RENDER_SEC // 60}p...")
        with browser_lock:
            with sync_playwright() as p:
                browser = launch_aidancing_browser(p)
                page = browser.new_page()
                try:
                    goto_aidancing_dashboard(page, browser)
                except RuntimeError as e:
                    print(f"?? {e}")
                    time.sleep(60)
                    browser.close()
                    return
                print(f"?? ?ang ?: {page.url}")
                time.sleep(10)

                for doc in orders_to_check:
                    job_id = str(doc.to_dict().get('aidancingJobId'))
                    print(f"?? ?ang t?m Job {job_id}...")

                    # Th? t?m text trong to?n b? trang
                    if job_id not in page.content():
                        print(f"? Kh?ng th?y m? {job_id} tr?n trang n?y. Ki?m tra xem Job c? ? trang 2 kh?ng?")
                        continue

                    # [FIX]: T?m ch?nh x?c th? Card ch?a ??n h?ng n?y b?ng c?ch m? r?ng d?n t? ph?n t? nh? nh?t
                    # ??m b?o kh?ng bao gi? b? d?nh v?o th? List to ??ng ch?a nhi?u ??n h?ng (khi?n cho b? nh?n nh?m tr?ng th?i c?a ??n kh?c)
                    containers = page.locator(f'div:has-text("{job_id}")')
                    count = containers.count()
                    card = None
                    
                    for i in range(count - 1, -1, -1):
                        container = containers.nth(i)
                        text = container.inner_text()
                        
                        # ??m s? l??ng Job ID (6 s?) trong th? n?y
                        ids_inside = set(re.findall(r'\b\d{6}\b', text))
                        if len(ids_inside) > 1:
                            # N?u th? ch?a nhi?u h?n 1 ??n h?ng -> N? l? th? List cha. D?ng l?i, d?ng th? con tr??c ??.
                            break
                        card = container

                    if card and card.is_visible():
                        text = card.inner_text()
                        # [FIX]: B? "T?i Xu?ng" v? "Download" kh?i ?i?u ki?n v? n?t n?y lu?n hi?n th? tr?n UI k? c? khi ?ang x? l?
                        if any(x in text for x in ["?? xong", "Success"]):
                            print(f"?? Job {job_id} HO?N T?T! ?ang x? l?...")
                            # ... (gi? nguy?n logic x? l? th?nh c?ng)
                            try:
                                # B??c 1: Th? l?y link tr?c ti?p t? n?t T?i TRONG CARD N?Y
                                ext_url = None
                                video_element = card.locator('video source, video[src]').first
                                if video_element.count() > 0 and video_element.is_visible():
                                    ext_url = video_element.get_attribute('src') or video_element.get_attribute('currentSrc')

                                download_link = card.locator(
                                    'a[href*="proxy/files"], a[href*="download"], a:has-text("T?i"), a:has-text("Download")'
                                ).first
                                if not ext_url and download_link.count() > 0 and download_link.is_visible():
                                    ext_url = download_link.get_attribute('href', timeout=3000)

                                # B??c 3 (D? ph?ng): Click v?o card ?? v?o trang chi ti?t l?y video
                                if not ext_url:
                                    try:
                                        print(f"??? Click v?o Job {job_id} ?? l?y link video...")
                                        card.click()
                                        page.wait_for_timeout(5000)
                                        # [FIX]: Ki?m tra xem trang C? TH?C S? CHUY?N HAY KH?NG
                                        if "dashboard" not in page.url:
                                            video_element = page.locator('video source, video[src]').first
                                            if video_element.count() > 0:
                                                ext_url = video_element.get_attribute('src')
                                            page.goto(DASHBOARD_URL) # Quay l?i Dashboard
                                            time.sleep(3)
                                        else:
                                            print(f"? N?t click kh?ng chuy?n trang. B? qua ?? tr?nh l?y nh?m video ngo?i Dashboard.")
                                    except Exception as e:
                                        print(f"? L?i khi v?o trang chi ti?t cho Job {job_id}: {e}")

                                # B??c 3: T?i file n?u ?? c? link (k?m cookies)
                                if ext_url:
                                    if not ext_url.startswith('http'):
                                        ext_url = AIDANCING_ORIGIN + ext_url

                                    dl_btn = download_link if (download_link.count() > 0 and ext_url) else None
                                    local_vid = download_aidancing_result(
                                        browser, page, ext_url, f"res_{doc.id}.mp4", download_locator=dl_btn
                                    )
                                    if local_vid:
                                        r2_url = upload_to_r2(local_vid)
                                        if r2_url:
                                            db.collection('orders').document(doc.id).update({
                                                'status': 'completed',
                                                'resultLink': r2_url,
                                                'updatedAt': firestore.SERVER_TIMESTAMP
                                            })
                                            print(f"? ?? TR? H?NG CHO ??N {doc.id}")
                                            
                                            # G?i th?ng b?o Telegram: ??n h?ng ho?n th?nh
                                            try:
                                                order_data = doc.to_dict()
                                                short_id = doc.id[-6:].upper()
                                                user_name = order_data.get('userName', 'Kh?ch h?ng')
                                                user_email = order_data.get('userEmail', 'N/A')
                                                char_img = order_data.get('characterImageLink', '')
                                                msg = (
                                                    f"<b>DON HANG HOAN THANH</b>\n\n"
                                                    f"Ma don: #{short_id}\n"
                                                    f"Khach: {user_name}\n"
                                                    f"Email: {user_email}\n"
                                                )
                                                if char_img:
                                                    msg += f"Anh dau vao: <a href=\"{char_img}\">Xem anh goc</a>\n"
                                                msg += f"Ket qua: <a href=\"{r2_url}\">Xem video</a>"
                                                send_telegram_message(msg)
                                            except Exception as tele_err:
                                                print(f"?? L?i g?i th?ng b?o Telegram ho?n th?nh: {tele_err}")

                                            # G?i mail th?ng b?o t? ??ng cho kh?ch h?ng
                                            try:
                                                order_data = doc.to_dict()
                                                send_completion_email(doc.id, order_data, r2_url)
                                            except Exception as mail_err:
                                                print(f"?? Kh?ng g?i ???c email th?ng b?o: {mail_err}")
                                                
                                            os.remove(local_vid)
                            except Exception as e:
                                print(f"?? L?i x? l? Job {job_id}: {e}")
                            finally:
                                close_extra_aidancing_tabs(browser, page)
                                if page.url != DASHBOARD_URL:
                                    try:
                                        page.goto(DASHBOARD_URL, wait_until='domcontentloaded', timeout=60000)
                                        time.sleep(2)
                                    except Exception:
                                        pass
                        elif any(x in text for x in ["Ch?a th?nh c?ng", "Th?t b?i", "Failed", "Error"]):
                            print(f"? Job {job_id} TH?T B?I TR?N AIDANCING!")
                            order_data = doc.to_dict()
                            
                            # Ho?n ti?n cho kh?ch
                            cost_coins = order_data.get('costCoins', 0)
                            user_id = order_data.get('userId')
                            if cost_coins > 0 and user_id:
                                try:
                                    db.collection('users').document(user_id).update({
                                        'coins': firestore.Increment(cost_coins)
                                    })
                                    print(f"?? ?? ho?n l?i {cost_coins} coin cho user {user_id}")
                                except Exception as e:
                                    print(f"?? L?i khi ho?n ti?n cho user {user_id}: {e}")

                            db.collection('orders').document(doc.id).update({
                                'status': 'failed',
                                'adminNote': '?nh ho?c video qu? kh?ch t?i l?n kh?ng h?p l?, h? th?ng ?? ho?n l?i coin.',
                                'updatedAt': firestore.SERVER_TIMESTAMP
                            })

                            # G?i th?ng b?o Telegram: ??n h?ng th?t b?i
                            try:
                                order_data = doc.to_dict()
                                short_id = doc.id[-6:].upper()
                                user_name = order_data.get('userName', 'Khach hang')
                                user_email = order_data.get('userEmail', 'N/A')
                                msg = (
                                    f"<b>DON HANG THAT BAI</b>\n\n"
                                    f"Ma don: #{short_id}\n"
                                    f"Khach: {user_name}\n"
                                    f"Email: {user_email}\n"
                                    f"Ly do: Anh/video tham chieu khong hop le."
                                )
                                send_telegram_message(msg)
                            except Exception as tele_err:
                                print(f"?? L?i g?i th?ng b?o Telegram th?t b?i: {tele_err}")
                        else:
                            print(f"? Job {job_id} v?n ?ang render...")
                browser.close()
    except Exception as e:
        print(f"? L?i monitor: {e}")

def on_pending_orders_snapshot(keys, changes, read_time):
    if not is_bot_enabled():
        return
    _ensure_pending_worker()
    with _pending_queue_lock:
        for ch in changes:
            if ch.type.name != 'ADDED':
                continue
            oid = ch.document.id
            with _submitting_orders_lock:
                if oid in _submitting_orders:
                    continue
            if oid not in _pending_order_queue:
                _pending_order_queue.append(oid)
                print(f"?? X?p h?ng n?p ??n: {oid} (c?n {len(_pending_order_queue)} trong queue)")


def _rescan_pending_orders_loop():
    """Th? l?i ??n pending sau khi session Aidancing ???c s?a (m?i 5 ph?t)."""
    while True:
        time.sleep(SESSION_ERROR_BACKOFF_SEC)
        if not is_bot_enabled():
            continue
        try:
            docs = db.collection('orders').where(
                filter=FieldFilter("status", "==", "pending")
            ).limit(20).stream()
            with _pending_queue_lock:
                for doc in docs:
                    oid = doc.id
                    if _pending_submit_backoff_active(oid):
                        continue
                    with _submitting_orders_lock:
                        if oid in _submitting_orders:
                            continue
                    if oid not in _pending_order_queue:
                        _pending_order_queue.append(oid)
                        print(f"?? H?ng ??i th? l?i ??n pending: {oid}")
        except Exception as e:
            print(f"?? rescan pending: {e}")

def start_bot():
    global BOT_NAME
    parser = argparse.ArgumentParser(description='MotionAI order bot ? aidancing.net')
    parser.add_argument('--name', required=True, help='T?n bot duy nh?t (vd: aidancing-vps1, bot-may-nha)')
    parser.add_argument('--mode', choices=['browser', 'api', 'http'], default=None,
                        help='browser=Playwright; api/http=Pure HTTP (AIDANCING_COOKIE, kh?ng Chrome)')
    args = parser.parse_args()
    if args.mode:
        os.environ['BOT_MODE'] = args.mode
    BOT_NAME = normalize_bot_name(args.name)
    if not BOT_NAME:
        print("? T?n bot kh?ng h?p l?. D?ng: python bot.py --name aidancing-vps1")
        sys.exit(1)

    print(f"?? MotionAI BOT [{BOT_NAME}] (v3.8 - mode={os.environ.get('BOT_MODE', 'browser')}) ?ang kh?i ??ng...")
    cdp_url = os.environ.get("BOT_CDP_URL", "").strip()
    if cdp_url:
        if ensure_cdp_available(cdp_url):
            print(f"? Chrome CDP s?n s?ng: {cdp_url}")
        else:
            print(f"??  BOT_CDP_URL={cdp_url} nh?ng Chrome ch?a m? CDP!")
            print("    ? M? Chrome CDP ? terminal KH?C tr??c, gi? ch?y, r?i bot m?i n?i ???c.")
    start_bot_control_listener()
    start_processing_listener()

    if use_api_mode():
        try:
            _get_http_client()
            print("? Pure HTTP ? AIDANCING_COOKIE (kh?ng c?n Chrome/CDP)")
        except ValueError as e:
            print(f"??  Ch?a c?u h?nh cookie: {e}")

    def monitor_loop():
        while True:
            eligible, processing = _processing_monitor_state()
            if is_bot_enabled():
                check_finished_orders()
            if use_api_mode():
                sleep_sec = _monitor_sleep_seconds(len(eligible), processing)
            else:
                sleep_sec = 60 if processing else int(os.environ.get("BOT_POLL_IDLE_SEC", "300"))
            time.sleep(sleep_sec)

    threading.Thread(target=monitor_loop, daemon=True).start()
    threading.Thread(target=_rescan_pending_orders_loop, daemon=True).start()

    db.collection('orders').where(filter=FieldFilter("status", "==", "pending")).on_snapshot(on_pending_orders_snapshot)

    print(f"?? [{BOT_NAME}] ?ang tr?c ? l?ng nghe Firestore (b?t/t?t t? Admin)...")
    while True:
        time.sleep(1)

if __name__ == "__main__":
    start_bot()
