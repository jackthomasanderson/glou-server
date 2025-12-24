// Internationalization (i18n) Manager for Glou
class I18n {
    constructor() {
        this.translations = {};
        this.currentLang = this.getStoredLanguage() || this.getBrowserLanguage();
        this.init();
    }

    // Initialize: Load translations
    async init() {
        try {
            const response = await fetch('/assets/i18n.json');
            this.translations = await response.json();
            this.setLanguage(this.currentLang);
        } catch (error) {
            console.error('Failed to load translations:', error);
        }
    }

    // Get stored language preference
    getStoredLanguage() {
        return localStorage.getItem('glou-language');
    }

    // Get browser language
    getBrowserLanguage() {
        const browserLang = navigator.language.split('-')[0];
        return ['fr', 'en'].includes(browserLang) ? browserLang : 'en';
    }

    // Set current language
    setLanguage(lang) {
        if (['fr', 'en'].includes(lang)) {
            this.currentLang = lang;
            localStorage.setItem('glou-language', lang);
            document.documentElement.lang = lang;
            this.updateDOM();
        }
    }

    // Get translation by key path (e.g., 'nav.dashboard')
    t(key, defaultValue = key) {
        const keys = key.split('.');
        let value = this.translations[this.currentLang] || {};
        
        for (const k of keys) {
            value = value[k];
            if (value === undefined) return defaultValue;
        }
        
        return value || defaultValue;
    }

    // Get all translations for current language
    getAll() {
        return this.translations[this.currentLang] || {};
    }

    // Update all data-i18n attributes in DOM
    updateDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });

        // Dispatch event for custom handling
        window.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { language: this.currentLang } 
        }));
    }

    // Get available languages
    getAvailableLanguages() {
        return Object.keys(this.translations);
    }
}

// Create global i18n instance
const i18n = new I18n();

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    i18n.init().then(() => {
        setupLanguageToggle();
    });
});

// Setup language toggle button
function setupLanguageToggle() {
    const toggle = document.getElementById('lang-toggle');
    if (toggle) {
        toggle.textContent = i18n.currentLang === 'fr' ? 'English' : 'Français';
        toggle.addEventListener('click', () => {
            const newLang = i18n.currentLang === 'fr' ? 'en' : 'fr';
            i18n.setLanguage(newLang);
            toggle.textContent = newLang === 'fr' ? 'English' : 'Français';
        });
    }
}
