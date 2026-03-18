// static/js/library.js
let stories = [];
let activeSession = null;

// Show skeleton loading state
function showLoadingState() {
    const grid = document.getElementById('story-grid');
    grid.innerHTML = Array.from({ length: 3 }, () => `
        <div class="card skeleton skeleton-card"></div>
    `).join('');
}

async function loadStories() {
    showLoadingState();
    try {
        // Load stories and current session state in parallel
        const [storiesData, stateData] = await Promise.all([
            API.getStories(),
            API.getState()
        ]);
        stories = storiesData;
        activeSession = stateData.state;
        render();
    } catch (e) {
        console.error('Failed to load stories:', e);
        const grid = document.getElementById('story-grid');
        grid.innerHTML = '<p class="error-message">Failed to load stories. Please refresh the page.</p>';
    }
}

function render() {
    const grid = document.getElementById('story-grid');
    const empty = document.getElementById('empty-state');

    if (stories.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    grid.innerHTML = stories.map(story => {
        const isActive = activeSession && activeSession.story_id === story.id;
        return `
            <div class="card story-card story-card--${escapeHtml(story.theme)} ${isActive ? 'story-card--active' : ''}">
                ${isActive ? '<div class="session-badge">Session in Progress</div>' : ''}
                <div class="story-card__title">${escapeHtml(story.title)}</div>
                <div class="story-card__meta">
                    <span class="theme-badge theme-badge--${escapeHtml(story.theme)}">${escapeHtml(story.theme).replace('_', ' ')}</span>
                    ${story.scene_count} scene${story.scene_count !== 1 ? 's' : ''}
                </div>
                <div class="story-card__actions">
                    <button class="btn" onclick="editStory('${escapeAttr(story.id)}')">Edit</button>
                    <button class="btn" onclick="runStory('${escapeAttr(story.id)}')">${isActive ? 'Resume' : 'Run'}</button>
                    ${isActive ? `<button class="btn btn--danger" onclick="stopSession()">Stop</button>` : ''}
                    <div class="card-menu">
                        <button class="card-menu__trigger" aria-label="Story options" aria-expanded="false" aria-haspopup="true" onclick="toggleCardMenu(this, event)">⋯</button>
                        <div class="card-menu__dropdown" role="menu">
                            <button class="card-menu__item" role="menuitem" onclick="exportStory('${escapeAttr(story.id)}', '${escapeAttr(story.title)}')">Export JSON</button>
                            <button class="card-menu__item card-menu__item--danger" role="menuitem" onclick="deleteStory('${escapeAttr(story.id)}')">Delete</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function createNewStory() {
    const title = prompt('Story title:');
    if (!title || !title.trim()) return;

    const story = await API.createStory(title.trim());
    window.location.href = `/editor?story=${story.id}`;
}

function editStory(id) {
    window.location.href = `/editor?story=${id}`;
}

function runStory(id) {
    window.location.href = `/run?story=${id}`;
}

async function deleteStory(id) {
    if (!confirm('Delete this story?')) return;
    await API.deleteStory(id);
    await loadStories();
}

async function exportStory(id, title) {
    try {
        const story = await API.getStory(id);
        const json = JSON.stringify(story, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Failed to export story:', e);
        alert('Failed to export story');
    }
}

async function stopSession() {
    if (!confirm('Stop the current session? Players will see the waiting screen.')) return;
    await API.restart();
    await loadStories();
}

function toggleCardMenu(trigger, event) {
    event.stopPropagation();
    const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
    // Close all other menus
    document.querySelectorAll('.card-menu__trigger[aria-expanded="true"]').forEach(t => {
        t.setAttribute('aria-expanded', 'false');
    });
    // Toggle this one
    trigger.setAttribute('aria-expanded', !isExpanded);
}

// Close card menus when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.card-menu__trigger[aria-expanded="true"]').forEach(t => {
        t.setAttribute('aria-expanded', 'false');
    });
});

// Escape key closes card menus and rules modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.card-menu__trigger[aria-expanded="true"]').forEach(t => {
            t.setAttribute('aria-expanded', 'false');
            t.focus();
        });
        closeRulesModal();
    }
});

// Rules modal functions
function showRules() {
    document.getElementById('rules-modal').classList.remove('rules-modal--hidden');
}

function closeRulesModal() {
    document.getElementById('rules-modal').classList.add('rules-modal--hidden');
}

loadStories();
