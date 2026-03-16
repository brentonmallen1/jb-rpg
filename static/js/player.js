// static/js/player.js
let story = null;
let state = null;

const sse = new SSEClient(handleStateUpdate);

async function init() {
    sse.connect();
}

async function handleStateUpdate(data) {
    state = data.state;

    if (!state) {
        renderWaiting();
        return;
    }

    // Load story if needed or if story changed
    if (!story || story.id !== state.story_id) {
        try {
            story = await API.getStory(state.story_id);
            ThemeManager.setTheme(story.theme);
        } catch (e) {
            console.error('Failed to load story:', e);
            return;
        }
    }

    render();
}

function renderWaiting() {
    document.getElementById('player-view').innerHTML = `
        <div class="waiting-state">
            <p>Waiting for storyteller to start...</p>
        </div>
    `;
}

function render() {
    if (!state || !story) return;

    const sceneIdx = story.scenes.findIndex(s => s.id === state.current_scene_id) + 1;
    const displayIdx = sceneIdx > 0 ? sceneIdx : 1;
    const progress = (displayIdx / story.scenes.length) * 100;

    const hpHtml = Array.from({ length: story.settings.starting_hp }, (_, i) =>
        `<span class="hp-indicator ${i >= state.hp ? 'hp-indicator--empty' : ''}">&#9829;</span>`
    ).join('');

    const itemsHtml = state.items.length > 0
        ? `<ul class="items-list">${state.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
        : '<p style="color: var(--text-secondary); margin-bottom: var(--space-xl);">No items yet</p>';

    let statusHtml = '';
    if (state.status === 'madlib_in_progress') {
        statusHtml = '<div class="status-message" style="color: var(--text-secondary);">Creating character...</div>';
    } else if (state.status === 'game_over') {
        if (state.outcome === 'victory') {
            statusHtml = '<div class="status-message" style="color: var(--success); font-size: 2rem; font-weight: bold;">VICTORY!</div>';
        } else if (state.outcome === 'defeat') {
            statusHtml = '<div class="status-message" style="color: var(--danger); font-size: 2rem; font-weight: bold;">DEFEATED</div>';
        } else {
            statusHtml = '<div class="status-message" style="color: var(--warning);">Awaiting final roll...</div>';
        }
    }

    document.getElementById('player-view').innerHTML = `
        ${state.character ? `
            <div class="character-name" onclick="showCharacter()" title="Tap for description">
                ${escapeHtml(state.character.name)}
            </div>
        ` : ''}

        <div class="hp-display hp-container">${hpHtml}</div>

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

        ${statusHtml}
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

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

init();
