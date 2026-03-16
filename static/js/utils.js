// static/js/utils.js

/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} text - Value to escape (converted to string)
 * @returns {string} Escaped HTML string
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Escape text for use in HTML attributes.
 * @param {*} text - Value to escape
 * @returns {string} Escaped attribute string
 */
function escapeAttr(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}
