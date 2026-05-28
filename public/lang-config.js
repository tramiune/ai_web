/** Country → language for tier-1 / tier-2 ad markets. Fallback: en. */
window.LANG_CONFIG = {
    supported: ['vi'],
    flags: {
        vi: '🇻🇳'
    },
    /** ISO 3166-1 alpha-2 → locale code */
    countryToLang: {
        VN: 'vi',
        // Tier 2 — Spanish LATAM + Spain
        ES: 'es', MX: 'es', CO: 'es', AR: 'es', CL: 'es', PE: 'es', EC: 'es',
        VE: 'es', UY: 'es', PY: 'es', BO: 'es', CR: 'es', PA: 'es', DO: 'es',
        GT: 'es', HN: 'es', NI: 'es', SV: 'es', PR: 'es', CU: 'es',
        // Tier 2 — Portuguese
        BR: 'pt', PT: 'pt',
        // Tier 2 — Southeast Asia
        TH: 'th', ID: 'id'
        // Tier 1 + rest → en (US, GB, CA, AU, PH, SG, DE, FR, …)
    },
    langFromCountry(country) {
        return 'vi';
    }
};
