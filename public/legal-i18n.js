(function applyLegalI18n() {
    const supported = window.LANG_CONFIG?.supported || ['vi', 'en'];

    function detectLangFromBrowser() {
        const langs = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
        for (const l of langs) {
            if (String(l).toLowerCase().startsWith('vi')) return 'vi';
        }
        return 'en';
    }

    function resolveLang() {
        return fetch('/api/geo', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data && String(data.country || '').toUpperCase() === 'VN') return 'vi';
                if (data) return 'en';
                return detectLangFromBrowser();
            })
            .catch(() => detectLangFromBrowser());
    }

    function lookup(path, locale) {
        let value = window.TRANSLATIONS?.[locale];
        if (!value) return null;
        for (const key of path.split('.')) {
            if (value && Object.prototype.hasOwnProperty.call(value, key)) {
                value = value[key];
            } else {
                return null;
            }
        }
        return value;
    }

    function makeT(lang) {
        const locale = supported.includes(lang) ? lang : 'en';
        return function t(path) {
            return lookup(path, locale) || lookup(path, 'en') || lookup(path, 'vi');
        };
    }

    resolveLang().then((lang) => {
        const locale = supported.includes(lang) ? lang : 'en';
        const t = makeT(locale);
        document.documentElement.lang = locale;

        const titleKey = document.body.getAttribute('data-page-title');
        if (titleKey) {
            const title = t(titleKey);
            if (title) document.title = title;
        }

        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const translation = t(el.getAttribute('data-i18n'));
            if (translation) el.innerHTML = translation;
        });
    });
})();
