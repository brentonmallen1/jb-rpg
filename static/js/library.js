// static/js/library.js
let stories = [];

async function loadStories() {
    stories = await API.getStories();
    render();
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
    grid.innerHTML = stories.map(story => `
        <div class="card story-card">
            <div class="story-card__title">${escapeHtml(story.title)}</div>
            <div class="story-card__meta">
                <span class="theme-badge">${escapeHtml(story.theme)}</span>
                ${story.scene_count} scene${story.scene_count !== 1 ? 's' : ''}
            </div>
            <div class="story-card__actions">
                <button class="btn" onclick="editStory('${escapeHtml(story.id)}')">Edit</button>
                <button class="btn" onclick="runStory('${escapeHtml(story.id)}')">Run</button>
                <button class="btn btn--danger" onclick="deleteStory('${escapeHtml(story.id)}')">Delete</button>
            </div>
        </div>
    `).join('');
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

loadStories();
