// static/js/library.js
let stories = [];
let activeSession = null;

async function loadStories() {
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
                        <button class="card-menu__trigger">⋯</button>
                        <div class="card-menu__dropdown">
                            <button class="card-menu__item card-menu__item--danger" onclick="deleteStory('${escapeAttr(story.id)}')">Delete</button>
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

async function stopSession() {
    if (!confirm('Stop the current session? Players will see the waiting screen.')) return;
    await API.restart();
    await loadStories();
}

loadStories();
