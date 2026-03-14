/**
 * Toast — RTL Knotless V2
 *
 * Global toast notification system.
 * Usage: showToast('message', 'success' | 'error' | 'info')
 *
 * Positions: 'titlebar' | 'top-left' | 'top-right' | 'bottom-center'
 * Default: 'titlebar' (centered in the title bar strip at top)
 */

let _container = null;
let _toastId = 0;
let _position = 'titlebar'; // default

const ICONS = { success: '✓', error: '✕', info: '·' };

// All known position classes
const POSITIONS = ['pos-titlebar', 'pos-top-left', 'pos-top-right', 'pos-bottom-center'];

function getContainer() {
    if (!_container) {
        _container = document.getElementById('toast-container');
        if (!_container) {
            _container = document.createElement('div');
            _container.id = 'toast-container';
            document.body.appendChild(_container);
        }
    }
    return _container;
}

function applyPosition(container) {
    container.className = 'toast-container';
    container.classList.add(`pos-${_position}`);
}

/**
 * Set the toast notification position and persist for this session.
 * @param {'titlebar'|'top-left'|'top-right'|'bottom-center'} pos
 */
export function setToastPosition(pos) {
    _position = pos;
    const container = getContainer();
    applyPosition(container);
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} [duration=2200] - ms before auto-dismiss
 */
export function showToast(message, type = 'info', duration = 2200) {
    const container = getContainer();
    // Ensure position class is applied (handles first call)
    applyPosition(container);

    const id = ++_toastId;

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.dataset.toastId = id;
    el.innerHTML = `<span class="toast-icon">${ICONS[type] ?? '·'}</span>${message}`;
    container.appendChild(el);

    setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 200);
    }, duration);

    return id;
}
