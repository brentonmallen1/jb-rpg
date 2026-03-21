// static/js/player.js
let story = null;
let state = null;
let storytellerConnected = false;
let pollInterval = null;

// Extract session_id from URL path: /player/{session_id}
function getSessionId() {
    const match = window.location.pathname.match(/^\/player\/([a-z0-9]+)$/);
    return match ? match[1] : null;
}

const sessionId = getSessionId();
const sse = new SSEClient(handleStateUpdate);

// Theme-specific waiting messages
const WAITING_MESSAGES = {
    fantasy: "The tale begins soon... Your storyteller prepares the ancient scrolls.",
    cyberpunk: "STANDBY... Narrative upload initializing.",
    deep_space: "Awaiting transmission from the storyteller...",
    horror: "Something stirs in the darkness... The story approaches.",
    modern: "Your story is about to begin. Please wait.",
    insanity: "The stars align... Your sanity trembles at the threshold of forbidden knowledge.",
    default: "Your adventure awaits..."
};

// Theme-specific character creation messages
const CREATION_MESSAGES = {
    fantasy: "The ancient spirits weave your destiny...",
    cyberpunk: "GENERATING IDENTITY PROFILE...",
    deep_space: "Calibrating neural imprint...",
    horror: "Something watches as your fate takes shape...",
    modern: "Building your character profile...",
    insanity: "Your mind fractures as eldritch truths take shape...",
    default: "Creating your character..."
};

function getWaitingMessage() {
    const theme = story?.theme || localStorage.getItem('jb_rpg_last_theme');
    return WAITING_MESSAGES[theme] || WAITING_MESSAGES.default;
}

function getCreationMessage() {
    const theme = story?.theme || localStorage.getItem('jb_rpg_last_theme');
    return CREATION_MESSAGES[theme] || CREATION_MESSAGES.default;
}

async function init() {
    // Start SSE for instant updates (pass sessionId for player auth)
    sse.connect(null, sessionId);

    // Also poll every 3 seconds as primary reliability mechanism
    pollInterval = setInterval(pollForUpdates, 3000);

    // Initial poll immediately
    await pollForUpdates();
}

async function pollForUpdates() {
    try {
        const data = await API.getState(sessionId);
        // Check if anything changed
        const newStateJson = JSON.stringify(data.state);
        const currentStateJson = JSON.stringify(state);
        const storytellerChanged = data.storyteller_connected !== storytellerConnected;

        if (newStateJson !== currentStateJson || storytellerChanged) {
            handleStateUpdate(data);
        }
    } catch (e) {
        console.error('Poll failed:', e);
    }
}

async function handleStateUpdate(data) {
    state = data.state;
    storytellerConnected = data.storyteller_connected;

    // Show waiting if no state OR storyteller is not connected
    if (!state || !storytellerConnected) {
        renderWaiting();
        return;
    }

    // Load story if needed or if story changed
    if (!story || story.id !== state.story_id) {
        try {
            story = await API.getStory(state.story_id);
            ThemeManager.setTheme(story.theme);
            localStorage.setItem('jb_rpg_last_theme', story.theme);
        } catch (e) {
            console.error('Failed to load story:', e);
            document.getElementById('player-view').innerHTML = `
                <div class="waiting-state">
                    <p style="color: var(--danger);">Error loading story. Please refresh.</p>
                </div>
            `;
            return;
        }
    }

    render();
}

function renderWaiting() {
    // Apply last theme if available
    const lastTheme = localStorage.getItem('jb_rpg_last_theme');
    if (lastTheme) {
        ThemeManager.setTheme(lastTheme);
    }

    document.getElementById('player-view').innerHTML = `
        <div class="waiting-state">
            <p>${getWaitingMessage()}</p>
        </div>
    `;
}

function render() {
    if (!state || !story) return;

    const sceneIdx = story.scenes.findIndex(s => s.id === state.current_scene_id) + 1;
    const displayIdx = sceneIdx > 0 ? sceneIdx : 1;
    const progress = (displayIdx / story.scenes.length) * 100;

    const hpHtml = Array.from({ length: story.settings.starting_hp }, (_, i) =>
        `<span class="hp-indicator ${i >= state.hp ? 'hp-indicator--empty' : ''}"></span>`
    ).join('');

    const itemsHtml = state.items.length > 0
        ? `<ul class="items-list">${state.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
        : '<p style="color: var(--text-secondary); margin-bottom: var(--space-xl);">No items yet</p>';

    let statusHtml = '';
    let headerHtml = '';
    let footerHtml = '';
    if (state.status === 'madlib_in_progress') {
        headerHtml = `
            <div class="creation-header">
                <div class="waiting-message">${getWaitingMessage()}</div>
            </div>
        `;
        footerHtml = `
            <div class="creation-footer">
                <div class="creation-message">${getCreationMessage()}</div>
            </div>
        `;
    } else if (state.status === 'awaiting_scene_selection') {
        statusHtml = `
            <div class="scene-selection-notice">
                <p>The storyteller is choosing the next scene...</p>
            </div>
        `;
    } else if (state.status === 'game_over') {
        const rollCount = state.level;
        const bonus = state.items.length;

        let outcomeHtml = '';
        if (state.outcome === 'victory') {
            outcomeHtml = '<div class="finale-outcome finale-outcome--victory">VICTORY!</div>';
        } else if (state.outcome === 'defeat') {
            outcomeHtml = '<div class="finale-outcome finale-outcome--defeat">DEFEATED</div>';
        } else {
            outcomeHtml = `
                <div class="finale-roll-info">
                    <div style="font-weight: bold; margin-bottom: var(--space-sm);">The Final Challenge</div>
                    <div>You have <strong>${rollCount}</strong> roll${rollCount !== 1 ? 's' : ''}</div>
                    <div>Add <strong>+${bonus}</strong> to each roll</div>
                    <div>Need <strong>20+</strong> to win</div>
                </div>
            `;
        }

        statusHtml = `
            <div class="finale-section">
                ${outcomeHtml}
                ${state.items.length > 0 ? `
                    <div class="finale-items">
                        ${state.items.map(i => escapeHtml(i)).join(' • ')}
                    </div>
                ` : ''}
            </div>
        `;
    }

    document.getElementById('player-view').innerHTML = `
        ${headerHtml}
        ${state.character ? `
            <div class="character-section" onclick="showCharacter()" title="Tap for full description">
                <div class="character-name">
                    ${escapeHtml(state.character.name)}
                </div>
                <div class="character-description-preview">
                    ${escapeHtml(state.character.description.length > 120
                        ? state.character.description.slice(0, 120) + '...'
                        : state.character.description)}
                </div>
            </div>
        ` : ''}

        <div class="hp-section">
            <div class="hp-label">Health</div>
            <div class="hp-display hp-container">${hpHtml}</div>
        </div>

        <div class="stats">
            <div class="stat-block">
                <div class="stat-block__value">${state.level}</div>
                <div class="stat-block__label">Level</div>
            </div>
            <div class="stat-block">
                <div class="stat-block__value">${state.items.length}</div>
                <div class="stat-block__label">Items</div>
            </div>
        </div>

        ${itemsHtml}

        <div class="progress-bar">
            <div class="progress-bar__fill" style="width: ${progress}%"></div>
        </div>
        <div style="color: var(--text-secondary); margin-bottom: var(--space-lg);">
            Scene ${displayIdx} of ${story.scenes.length}
        </div>

        ${state.choices_revealed && state.shuffled_choices.length > 0 ? `
            <div class="revealed-choices">
                <div class="revealed-choices__header">The Choices</div>
                ${state.shuffled_choices.map(text => `
                    <div class="revealed-choice">${escapeHtml(text)}</div>
                `).join('')}
            </div>
        ` : ''}

        ${statusHtml}
        ${footerHtml}
    `;
}

function showCharacter() {
    if (!state?.character) return;
    document.getElementById('modal-name').textContent = state.character.name;
    document.getElementById('modal-description').textContent = state.character.description;
    document.getElementById('character-modal').classList.remove('modal--hidden');
}

function closeModal() {
    document.getElementById('character-modal').classList.add('modal--hidden');
}

function showRules() {
    document.getElementById('rules-modal').classList.remove('modal--hidden');
}

function closeRulesModal() {
    document.getElementById('rules-modal').classList.add('modal--hidden');
}

// Escape key closes modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeRulesModal();
    }
});

init();
