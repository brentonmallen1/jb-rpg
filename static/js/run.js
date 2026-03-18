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
        // Check if we have a valid token to control this session
        const tokenCheck = await API.validateToken();

        if (tokenCheck.valid) {
            // We have control - ask user what to do
            const resume = confirm(
                'A session is already in progress for this story.\n\n' +
                'Click OK to resume, or Cancel to start over.'
            );
            if (resume) {
                state = current.state;
                resolved = current.resolved;
                render();
            } else {
                // Restart
                await API.restart();
                state = await API.startSession(storyId);
                const fresh = await API.getState();
                resolved = fresh.resolved;
                render();
            }
        } else {
            // No valid token - need to start over to take control
            const takeOver = confirm(
                'A session is in progress but you don\'t have storyteller control.\n\n' +
                'Click OK to restart and take control, or Cancel to view as player.'
            );
            if (takeOver) {
                await API.restart();
                state = await API.startSession(storyId);
                const fresh = await API.getState();
                resolved = fresh.resolved;
                render();
            } else {
                window.location.href = '/player';
                return;
            }
        }
    } else if (current.state && current.state.story_id !== storyId) {
        // Check token for the other session
        const tokenCheck = await API.validateToken();

        if (tokenCheck.valid) {
            // Different story in progress, we have control - ask to switch
            const switchStory = confirm(
                'A different story is currently in progress.\n\n' +
                'Click OK to start this story (ends current session), or Cancel to go back.'
            );
            if (switchStory) {
                await API.restart();
                state = await API.startSession(storyId);
                const fresh = await API.getState();
                resolved = fresh.resolved;
                render();
            } else {
                window.location.href = '/';
                return;
            }
        } else {
            // No valid token for different story - just take over
            await API.restart();
            state = await API.startSession(storyId);
            const fresh = await API.getState();
            resolved = fresh.resolved;
            render();
        }
    } else {
        // No session - start fresh
        try {
            state = await API.startSession(storyId);
            const fresh = await API.getState();
            resolved = fresh.resolved;
            render();
        } catch (e) {
            document.getElementById('main-content').innerHTML =
                `<p style="color: var(--danger);">Error: ${escapeHtml(e.message)}</p>`;
        }
    }

    // Connect SSE with token to identify as storyteller
    sse.connect(API._sessionToken);
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
    } else if (state.status === 'awaiting_scene_selection') {
        renderSceneSelector();
    } else {
        renderScene();
    }
}

function updateStatusBar() {
    if (!story || !state) return;

    // HP display
    const hpHtml = Array.from({ length: story.settings.starting_hp }, (_, i) =>
        `<span class="hp-indicator ${i >= state.hp ? 'hp-indicator--empty' : ''}"></span>`
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
    const submitBtn = document.querySelector('.madlib-view .btn');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;

    // Disable input and button
    input.disabled = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('btn--loading');
    }

    try {
        state = await API.submitMadlib(value);
        if (state.character && state.status === 'running') {
            renderCharacterReveal();
        } else {
            const fresh = await API.getState();
            resolved = fresh.resolved;
            render();
        }
    } catch (e) {
        input.disabled = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn--loading');
        }
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
        else if (c.kind === 'item') outcome = c.item_name ? escapeHtml(c.item_name) : '<em>No item set</em>';
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

    // Show Choices button for players
    const revealBtnHtml = state.choices_revealed
        ? '<button class="btn btn--secondary" disabled style="margin-top: var(--space-md);">Choices Visible to Players</button>'
        : '<button class="btn" onclick="revealChoices()" style="margin-top: var(--space-md);">Show Choices to Players</button>';

    document.getElementById('main-content').innerHTML = `
        <div class="scene-title">Scene ${sceneIdx}: ${escapeHtml(scene.title)}</div>
        <div class="scene-text">${escapeHtml(sceneText)}</div>
        <div class="choices">${choicesHtml}</div>
        ${revealBtnHtml}
        ${prevHtml}
    `;
}

async function revealChoices() {
    try {
        state = await API.revealChoices();
        render();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function makeChoice(index) {
    // Disable all choice buttons
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('btn--loading');
    });

    try {
        state = await API.makeChoice(index);
        const fresh = await API.getState();
        resolved = fresh.resolved;
        render();
    } catch (e) {
        // Re-enable buttons on error
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('btn--loading');
        });
        alert('Error: ' + e.message);
    }
}

function getOutcomeBadge(historyEntry) {
    if (historyEntry.outcome === 'damage') {
        return `<span class="scene-badge scene-badge--damage">&minus;1 HP</span>`;
    } else if (historyEntry.outcome === 'item') {
        const itemName = historyEntry.item_name || 'Item';
        return `<span class="scene-badge scene-badge--item">${escapeHtml(itemName)}</span>`;
    } else if (historyEntry.outcome === 'level') {
        return `<span class="scene-badge scene-badge--level">+1 LVL</span>`;
    }
    return '';
}

function renderSceneSelector() {
    if (!story || !state) return;

    const playedIds = new Set(state.history.map(h => h.scene_id));
    const historyByScene = {};
    state.history.forEach(h => { historyByScene[h.scene_id] = h; });

    // Build scene cards
    const sceneCardsHtml = story.scenes.map((scene, idx) => {
        const isPlayed = playedIds.has(scene.id);
        const historyEntry = historyByScene[scene.id];

        if (isPlayed) {
            return `
                <div class="scene-card scene-card--played">
                    <div class="scene-card__number">${idx + 1}</div>
                    <div class="scene-card__title">${escapeHtml(scene.title)}</div>
                    ${getOutcomeBadge(historyEntry)}
                </div>
            `;
        } else {
            return `
                <div class="scene-card scene-card--available" onclick="selectScene('${scene.id}')">
                    <div class="scene-card__number">${idx + 1}</div>
                    <div class="scene-card__title">${escapeHtml(scene.title)}</div>
                    <span class="scene-card__select">Select</span>
                </div>
            `;
        }
    }).join('');

    document.getElementById('main-content').innerHTML = `
        <div class="scene-selector">
            <h2 class="scene-selector__heading">Choose the Next Scene</h2>
            <div class="scene-selector__grid">
                ${sceneCardsHtml}
            </div>
        </div>
    `;
}

async function selectScene(sceneId) {
    // Disable all scene cards
    const cards = document.querySelectorAll('.scene-card--available');
    cards.forEach(card => {
        card.classList.add('scene-card--loading');
        card.onclick = null;
    });

    try {
        state = await API.selectScene(sceneId);
        const fresh = await API.getState();
        resolved = fresh.resolved;
        render();
    } catch (e) {
        // Re-enable cards on error
        cards.forEach(card => {
            card.classList.remove('scene-card--loading');
        });
        alert('Error: ' + e.message);
        render(); // Re-render to restore onclick handlers
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
        // Reconnect SSE with new token
        sse.connect(API._sessionToken);
        const fresh = await API.getState();
        resolved = fresh.resolved;
        render();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function stopSession() {
    if (!confirm('Stop the session? Players will see the waiting screen.')) return;
    try {
        await API.restart();
        window.location.href = '/';
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// Share functionality
function showShareModal() {
    const playerUrl = `${window.location.origin}/player`;
    document.getElementById('share-link').value = playerUrl;

    // Generate QR code
    const qrContainer = document.getElementById('qr-container');
    qrContainer.innerHTML = '';

    if (typeof qrcode !== 'undefined') {
        const qr = qrcode(0, 'M');
        qr.addData(playerUrl);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(5, 0);
        // Add alt text for accessibility
        const img = qrContainer.querySelector('img');
        if (img) img.alt = 'QR code linking to player view';
    } else {
        qrContainer.innerHTML = '<p style="color: var(--text-secondary);">QR code unavailable</p>';
    }

    document.getElementById('share-modal').classList.remove('share-modal--hidden');
}

function hideShareModal() {
    document.getElementById('share-modal').classList.add('share-modal--hidden');
}

function showRules() {
    document.getElementById('rules-modal').classList.remove('share-modal--hidden');
}

function closeRulesModal() {
    document.getElementById('rules-modal').classList.add('share-modal--hidden');
}

async function copyShareLink() {
    const input = document.getElementById('share-link');
    try {
        await navigator.clipboard.writeText(input.value);
        showToast('Link copied!');
    } catch (e) {
        // Fallback for older browsers
        input.select();
        document.execCommand('copy');
        showToast('Link copied!');
    }
}

function showToast(message) {
    // Simple toast notification
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: var(--space-lg);
        right: var(--space-lg);
        background: var(--success);
        color: white;
        padding: var(--space-sm) var(--space-md);
        border-radius: var(--radius-md);
        z-index: 1001;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// Escape key closes modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideShareModal();
        closeRulesModal();
    }
});

init();
