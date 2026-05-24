(function applyLegalI18n() {
    const LANG_KEY = 'app_lang';
    const lang = (localStorage.getItem(LANG_KEY) || 'vi').trim();
    const dict = window.TRANSLATIONS && window.TRANSLATIONS[lang];
    if (!dict) return;

    function t(path) {
        let value = dict;
        for (const key of path.split('.')) {
            if (value && Object.prototype.hasOwnProperty.call(value, key)) {
                value = value[key];
            } else {
                return null;
            }
        }
        return value;
    }

    document.documentElement.lang = lang === 'en' ? 'en' : 'vi';

    const titleKey = document.body.getAttribute('data-page-title');
    if (titleKey) {
        const title = t(titleKey);
        if (title) document.title = title;
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const translation = t(el.getAttribute('data-i18n'));
        if (translation) el.innerHTML = translation;
    });
})();
