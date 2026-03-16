// static/js/run.js
const params = new URLSearchParams(window.location.search);
const storyId = params.get('story');

let story = null;
let state = null;
let resolved = null;
let connectedCount = 0;

const sse = new SSEClient(handleStateUpdate);

async function init() {
    if (!storyId) {
        alert('No story ID');
        window.location.href = '/';
        return;
    }

    try {
        story = await API.getStory(storyId);
    } catch (e) {
        alert('Story not found');
        window.location.href = '/';
        return;
    }

    document.getElementById('story-title').textContent = story.title;
    ThemeManager.setTheme(story.theme);

    // Check if a session for this story is already active
    const current = await API.getState();
    if (current.state && current.state.story_id === storyId) {
        state = current.state;
        resolved = current.resolved;
        render();
    } else {
        // Start a new session
        try {
            state = await API.startSession(storyId);
            // Fetch resolved text for initial render
            const fresh = await API.getState();
            resolved = fresh.resolved;
            render();
        } catch (e) {
            document.getElementById('main-content').innerHTML =
                `<p style="color: var(--danger);">Error: ${escapeHtml(e.message)}</p>`;
        }
    }

    sse.connect();
}

function handleStateUpdate(data) {
    state = data.state;
    resolved = data.resolved;
    connectedCount = data.connected_count;
    render();
}

function render() {
    if (!state) {
        document.getElementById('main-content').innerHTML = '<p>No active session</p>';
        return;
    }

    updateStatusBar();

    if (state.status === 'madlib_in_progress') {
        renderMadlib();
    } else if (state.status === 'game_over') {
        renderFinale();
    } else {
        renderScene();
    }
}

function updateStatusBar() {
    if (!story || !state) return;

    // HP display
    const hpHtml = Array.from({ length: story.settings.starting_hp }, (_, i) =>
        `<span class="hp-indicator ${i >= state.hp ? 'hp-indicator--empty' : ''}">&#9829;</span>`
    ).join('');
    document.getElementById('hp-display').innerHTML = hpHtml;

    document.getElementById('level-display').textContent = state.level;
    document.getElementById('items-count').textContent = state.items.length;

    const sceneIdx = story.scenes.findIndex(s => s.id === state.current_scene_id) + 1;
    const displayIdx = sceneIdx > 0 ? sceneIdx : 1;
    document.getElementById('scene-progress').textContent = `Scene ${displayIdx} of ${story.scenes.length}`;

    document.getElementById('connected-count').textContent =
        connectedCount > 0 ? `${connectedCount} connected` : '';

    if (state.character) {
        document.getElementById('character-ref').textContent = state.character.description;
    }
}

function renderMadlib() {
    const field = story.madlib_template.fields[state.madlib_step];
    if (!field) return;

    const answeredHtml = Object.entries(state.madlib_answers)
        .map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</div>`)
        .join('');

    document.getElementById('main-content').innerHTML = `
        <div class="madlib-view">
            <div style="color: var(--text-secondary); margin-bottom: var(--space-md);">
                Question ${state.madlib_step + 1} of ${story.madlib_template.fields.length}
            </div>
            <div class="madlib-prompt">${escapeHtml(field.label)}</div>
            <input class="input madlib-input" id="madlib-input" autofocus
                   onkeypress="if(event.key === 'Enter') submitMadlib()">
            <button class="btn" onclick="submitMadlib()">Submit</button>
            <div class="madlib-answers">${answeredHtml}</div>
        </div>
    `;
    // Focus after DOM update
    setTimeout(() => {
        const el = document.getElementById('madlib-input');
        if (el) el.focus();
    }, 50);
}

async function submitMadlib() {
    const input = document.getElementById('madlib-input');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;

    // Disable input to prevent double submit
    input.disabled = true;

    try {
        state = await API.submitMadlib(value);
        // SSE will update resolved; fetch immediately for character reveal
        if (state.character && state.status === 'running') {
            renderCharacterReveal();
        } else {
            // Fetch resolved text since madlib endpoint returns GameState only
            const fresh = await API.getState();
            resolved = fresh.resolved;
            render();
        }
    } catch (e) {
        input.disabled = false;
        alert('Error: ' + e.message);
    }
}

function renderCharacterReveal() {
    document.getElementById('main-content').innerHTML = `
        <div class="character-reveal">
            <h2>Your Character</h2>
            <div class="character-description">${escapeHtml(state.character.description)}</div>
            <button class="btn" onclick="beginStory()">Begin the Story</button>
        </div>
    `;
}

async function beginStory() {
    const fresh = await API.getState();
    resolved = fresh.resolved;
    render();
}

function renderScene() {
    if (!story || !state) return;
    const scene = story.scenes.find(s => s.id === state.current_scene_id);
    if (!scene) return;

    const sceneIdx = story.scenes.findIndex(s => s.id === state.current_scene_id) + 1;

    const choicesHtml = scene.choices.map((c, i) => {
        let outcome = '';
        if (c.kind === 'damage') outcome = '&minus;1 HP';
        else if (c.kind === 'item') outcome = escapeHtml(c.item_name || 'Item');
        else if (c.kind === 'level') outcome = 'Level Up';

        return `
            <button class="choice-btn choice-btn--${c.kind}" onclick="makeChoice(${i})">
                ${escapeHtml(c.text)}
                <div class="choice-outcome">${outcome}</div>
            </button>
        `;
    }).join('');

    // Previous scene reminder
    let prevHtml = '';
    if (state.history.length > 0) {
        const lastEntry = state.history[state.history.length - 1];
        const prevScene = story.scenes.find(s => s.id === lastEntry.scene_id);
        if (prevScene) {
            prevHtml = `
                <div class="previous-scene">
                    Previous: ${escapeHtml(prevScene.title)} &mdash; ${escapeHtml(lastEntry.outcome)}
                </div>
            `;
        }
    }

    const sceneText = resolved?.scene_text || scene.base_text;

    document.getElementById('main-content').innerHTML = `
        <div class="scene-title">Scene ${sceneIdx}: ${escapeHtml(scene.title)}</div>
        <div class="scene-text">${escapeHtml(sceneText)}</div>
        <div class="choices">${choicesHtml}</div>
        ${prevHtml}
    `;
}

async function makeChoice(index) {
    try {
        state = await API.makeChoice(index);
        // Fetch updated resolved text (choice endpoint returns GameState only)
        const fresh = await API.getState();
        resolved = fresh.resolved;
        render();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

function renderFinale() {
    const rollCount = state.level;
    const bonus = state.items.length;

    let outcomeHtml = '';
    if (state.outcome === 'victory') {
        outcomeHtml = `
            <div class="outcome-victory">VICTORY!</div>
            <p>Congratulations, adventurer!</p>
        `;
    } else if (state.outcome === 'defeat') {
        outcomeHtml = `
            <div class="outcome-defeat">DEFEATED</div>
            <p>Better luck next time...</p>
        `;
    } else {
        outcomeHtml = `
            <div class="roll-info">
                <div style="margin-bottom: var(--space-md);">
                    <strong>Roll the dice!</strong>
                </div>
                <div>You have <strong>${rollCount}</strong> roll${rollCount !== 1 ? 's' : ''}</div>
                <div>Add <strong>+${bonus}</strong> to each roll</div>
                <div>Need <strong>20 or higher</strong> to win</div>
            </div>
            <div style="display: flex; gap: var(--space-md); justify-content: center; margin-top: var(--space-lg);">
                <button class="btn" onclick="finishGame('victory')">Victory!</button>
                <button class="btn btn--danger" onclick="finishGame('defeat')">Defeated</button>
            </div>
        `;
    }

    document.getElementById('main-content').innerHTML = `
        <div class="finale-view">
            <h2>The Final Challenge</h2>
            <div class="finale-stats">
                <div class="finale-stat">
                    <div class="finale-stat__value">${state.hp}</div>
                    <div class="finale-stat__label">HP Remaining</div>
                </div>
                <div class="finale-stat">
                    <div class="finale-stat__value">${state.level}</div>
                    <div class="finale-stat__label">Level</div>
                </div>
                <div class="finale-stat">
                    <div class="finale-stat__value">${state.items.length}</div>
                    <div class="finale-stat__label">Items</div>
                </div>
            </div>
            ${state.items.length > 0 ? `
                <div style="margin-bottom: var(--space-lg); color: var(--text-secondary);">
                    Items: ${state.items.map(i => escapeHtml(i)).join(', ')}
                </div>
            ` : ''}
            ${outcomeHtml}
        </div>
    `;
}

async function finishGame(outcome) {
    try {
        await API.finish(outcome);
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function goBack() {
    try {
        state = await API.goBack();
        const fresh = await API.getState();
        resolved = fresh.resolved;
        render();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function restart() {
    if (!confirm('Restart the session? This will clear all progress.')) return;
    try {
        await API.restart();
        state = await API.startSession(storyId);
        const fresh = await API.getState();
        resolved = fresh.resolved;
        render();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

init();
