// static/js/theme.js
const ThemeManager = {
    init() {
        // Load saved mode
        const mode = localStorage.getItem('mode') || 'dark';
        document.documentElement.dataset.mode = mode;
    },

    toggleMode() {
        const current = document.documentElement.dataset.mode;
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.mode = next;
        localStorage.setItem('mode', next);
    },

    setTheme(themeName) {
        // Remove existing theme
        const existing = document.querySelector('link[data-theme]');
        if (existing) existing.remove();

        if (!themeName) return;

        // Add new theme
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `/static/css/themes/${themeName}.css`;
        link.dataset.theme = themeName;
        document.head.appendChild(link);
    }
};

// Auto-init on load
document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
