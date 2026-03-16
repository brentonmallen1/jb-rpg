// static/js/editor.js
let story = null;
let currentView = null; // 'scene', 'madlib', 'settings'
let currentSceneId = null;
let isDirty = false;  // Track unsaved changes

const params = new URLSearchParams(window.location.search);
const storyId = params.get('story');

async function loadStory() {
    if (!storyId) {
        alert('No story ID provided');
        window.location.href = '/';
        return;
    }
    try {
        story = await API.getStory(storyId);
        document.getElementById('story-name').textContent = story.title;
        renderSidebar();
        if (story.scenes.length > 0) {
            selectScene(story.scenes[0].id);
        }
    } catch (e) {
        alert('Story not found');
        window.location.href = '/';
    }
}

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});

function renderSidebar() {
    const list = document.getElementById('scene-list');
    list.innerHTML = story.scenes.map((scene, i) => `
        <li class="scene-item ${scene.id === currentSceneId ? 'scene-item--active' : ''}"
            onclick="selectScene('${escapeAttr(scene.id)}')"
            draggable="true"
            data-id="${escapeAttr(scene.id)}">
            <span>${i + 1}. ${escapeHtml(scene.title || 'Untitled')}</span>
            <button class="scene-item__delete" onclick="deleteScene('${escapeAttr(scene.id)}', event)" title="Delete scene">×</button>
        </li>
    `).join('');
    setupDragDrop();
}

function selectScene(sceneId) {
    currentSceneId = sceneId;
    currentView = 'scene';
    renderSidebar();
    renderSceneEditor();
}

function renderSceneEditor() {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;

    const panel = document.getElementById('main-panel');
    panel.innerHTML = `
        <h2>Edit Scene</h2>

        <div class="form-group">
            <label>Scene Title</label>
            <input class="input" id="scene-title" value="${escapeHtml(scene.title)}" oninput="updateScene()">
        </div>

        <div class="form-group">
            <label>Scene Text</label>
            <textarea class="input" id="scene-text" oninput="updateScene()">${escapeHtml(scene.base_text)}</textarea>
            <details style="margin-top: var(--space-xs);">
                <summary style="cursor: pointer; color: var(--text-secondary);">Available variables</summary>
                <div style="padding: var(--space-sm); font-family: var(--font-mono); font-size: 0.875rem;">
                    ${story.madlib_template.fields.map(f =>
                        `<code onclick="insertVariable('scene-text', '${escapeAttr(f.key)}')"
                              style="cursor: pointer; margin-right: var(--space-sm); padding: 2px 4px; background: var(--bg-secondary); border-radius: var(--radius-sm);">{${escapeHtml(f.key)}}</code>`
                    ).join('')}
                    ${story.madlib_template.fields.length === 0 ? '<em>No mad lib fields defined</em>' : ''}
                </div>
            </details>
        </div>

        <div class="form-group">
            <label>Conditional Text</label>
            <div id="conditionals">
                ${scene.conditional_text.map((ct, i) => renderConditionalRow(ct, i)).join('')}
            </div>
            <button class="btn btn--secondary" style="margin-top: var(--space-sm);" onclick="addConditional()">+ Add Condition</button>
        </div>

        <div class="form-group">
            <label>Choices</label>
            ${scene.choices.map((c, i) => renderChoiceBlock(c, i)).join('')}
        </div>

        <div class="actions">
            <button class="btn" onclick="saveStory()">Save Story</button>
        </div>
    `;
}

function renderChoiceBlock(choice, index) {
    const kinds = ['damage', 'item', 'level'];
    const hasVariables = story.madlib_template.fields.length > 0;

    return `
        <div class="choice-block choice-block--${choice.kind}">
            <div class="choice-header">
                <select class="input" style="width: auto;" onchange="updateChoiceKind(${index}, this.value)">
                    ${kinds.map(k => `<option value="${k}" ${choice.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
                ${choice.kind === 'item' ? `
                    <input class="input" style="width: 200px;" placeholder="Item name"
                           value="${escapeHtml(choice.item_name || '')}"
                           oninput="updateChoiceItem(${index}, this.value)">
                ` : ''}
            </div>
            <div style="display: flex; gap: var(--space-sm); align-items: center;">
                <input class="input" id="choice-text-${index}" placeholder="Choice text" value="${escapeHtml(choice.text)}"
                       oninput="updateChoiceText(${index}, this.value)" style="flex: 1;">
                ${hasVariables ? `
                    <div class="dropdown" style="position: relative;">
                        <button type="button" class="btn btn--secondary" onclick="toggleChoiceVars(${index})" style="padding: var(--space-xs) var(--space-sm);">+var</button>
                        <div id="choice-vars-${index}" class="dropdown-menu" style="display: none; position: absolute; right: 0; top: 100%; background: var(--bg-secondary); border: 1px solid var(--text-secondary); border-radius: var(--radius-sm); padding: var(--space-sm); z-index: 10; min-width: 150px;">
                            ${story.madlib_template.fields.map(f =>
                                `<div onclick="insertChoiceVariable(${index}, '${escapeAttr(f.key)}')"
                                      style="cursor: pointer; padding: var(--space-xs); border-radius: var(--radius-sm);"
                                      onmouseover="this.style.background='var(--bg-primary)'"
                                      onmouseout="this.style.background='transparent'">{${escapeHtml(f.key)}}</div>`
                            ).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function renderConditionalRow(ct, index) {
    const cond = ct.condition;
    return `
        <div class="conditional-row">
            <select class="input" onchange="updateConditionType(${index}, this.value)" style="width: 130px;">
                <option value="hp" ${cond.type === 'hp' ? 'selected' : ''}>HP</option>
                <option value="items" ${cond.type === 'items' ? 'selected' : ''}>Items</option>
                <option value="level" ${cond.type === 'level' ? 'selected' : ''}>Level</option>
                <option value="scene_outcome" ${cond.type === 'scene_outcome' ? 'selected' : ''}>Scene Outcome</option>
            </select>
            ${cond.type === 'scene_outcome' ? `
                <select class="input" onchange="updateConditionSceneId(${index}, this.value)" style="width: 150px;">
                    ${story.scenes.map(s => `<option value="${escapeAttr(s.id)}" ${cond.scene_id === s.id ? 'selected' : ''}>${escapeHtml(s.title || s.id)}</option>`).join('')}
                </select>
                <select class="input" onchange="updateConditionOutcome(${index}, this.value)" style="width: 100px;">
                    <option value="damage" ${cond.outcome === 'damage' ? 'selected' : ''}>damage</option>
                    <option value="item" ${cond.outcome === 'item' ? 'selected' : ''}>item</option>
                    <option value="level" ${cond.outcome === 'level' ? 'selected' : ''}>level</option>
                </select>
            ` : `
                <select class="input" onchange="updateConditionOp(${index}, this.value)" style="width: 70px;">
                    <option value="lte" ${cond.op === 'lte' ? 'selected' : ''}>&le;</option>
                    <option value="gte" ${cond.op === 'gte' ? 'selected' : ''}>&ge;</option>
                    <option value="eq" ${cond.op === 'eq' ? 'selected' : ''}>=</option>
                </select>
                <input class="input" type="number" value="${cond.value !== null ? cond.value : 0}"
                       onchange="updateConditionValue(${index}, this.value)" style="width: 70px;">
            `}
            <input class="input" placeholder="Text to show" value="${escapeHtml(ct.text)}"
                   oninput="updateConditionText(${index}, this.value)">
            <button class="btn btn--danger" onclick="removeConditional(${index})" title="Remove">×</button>
        </div>
    `;
}

function updateScene() {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    const titleEl = document.getElementById('scene-title');
    const textEl = document.getElementById('scene-text');
    if (titleEl) scene.title = titleEl.value;
    if (textEl) scene.base_text = textEl.value;
    // Update sidebar numbering without full re-render (just update text)
    const activeItem = document.querySelector('.scene-item--active span');
    if (activeItem) {
        const idx = story.scenes.findIndex(s => s.id === currentSceneId);
        activeItem.textContent = `${idx + 1}. ${scene.title || 'Untitled'}`;
    }
}

function updateChoiceKind(index, kind) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    scene.choices[index].kind = kind;
    if (kind !== 'item') scene.choices[index].item_name = null;
    renderSceneEditor();
}

function updateChoiceText(index, text) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.choices[index].text = text;
}

function updateChoiceItem(index, name) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.choices[index].item_name = name;
}

function addConditional() {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    scene.conditional_text.push({
        condition: { type: 'hp', op: 'lte', value: 1, scene_id: null, outcome: null },
        text: ''
    });
    renderSceneEditor();
}

function removeConditional(index) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    scene.conditional_text.splice(index, 1);
    renderSceneEditor();
}

function updateConditionType(index, type) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    const ct = scene.conditional_text[index];
    ct.condition.type = type;
    if (type === 'scene_outcome') {
        ct.condition.op = null;
        ct.condition.value = null;
        ct.condition.scene_id = story.scenes[0]?.id || '';
        ct.condition.outcome = 'damage';
    } else {
        ct.condition.scene_id = null;
        ct.condition.outcome = null;
        ct.condition.op = 'lte';
        ct.condition.value = 1;
    }
    renderSceneEditor();
}

function updateConditionOp(index, op) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].condition.op = op;
}

function updateConditionValue(index, value) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].condition.value = parseInt(value, 10);
}

function updateConditionSceneId(index, sceneId) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].condition.scene_id = sceneId;
}

function updateConditionOutcome(index, outcome) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].condition.outcome = outcome;
}

function updateConditionText(index, text) {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].text = text;
}

function addScene() {
    isDirty = true;
    const id = 'scene_' + Date.now();
    story.scenes.push({
        id,
        title: 'New Scene',
        base_text: '',
        choices: [
            { kind: 'damage', text: 'Choice 1', amount: 1, item_name: null },
            { kind: 'item', text: 'Choice 2', item_name: 'Item', amount: 1 },
            { kind: 'level', text: 'Choice 3', amount: 1, item_name: null }
        ],
        conditional_text: []
    });
    renderSidebar();
    selectScene(id);
}

function deleteScene(id, event) {
    isDirty = true;
    event.stopPropagation();
    if (!confirm('Delete this scene?')) return;
    story.scenes = story.scenes.filter(s => s.id !== id);
    if (currentSceneId === id) {
        currentSceneId = story.scenes[0]?.id || null;
    }
    renderSidebar();
    if (currentSceneId) {
        renderSceneEditor();
    } else {
        document.getElementById('main-panel').innerHTML = '<p style="color: var(--text-secondary);">No scenes. Add one to get started.</p>';
    }
}

function showMadlibEditor() {
    currentView = 'madlib';
    currentSceneId = null;
    renderSidebar();
    const panel = document.getElementById('main-panel');
    panel.innerHTML = `
        <h2>Mad Libs Template</h2>

        <div class="form-group">
            <label>Template Text</label>
            <textarea class="input" id="madlib-prompt" oninput="updateMadlibPrompt()">${escapeHtml(story.madlib_template.prompt)}</textarea>
            <p style="color: var(--text-secondary); margin-top: var(--space-xs); font-size: 0.875rem;">Use {key} to define placeholders. Fields are auto-detected.</p>
        </div>

        <div class="form-group">
            <label>Fields</label>
            <div id="madlib-fields">
                ${story.madlib_template.fields.length === 0
                    ? '<p style="color: var(--text-secondary);">No fields yet. Add {key} placeholders to the template above.</p>'
                    : story.madlib_template.fields.map((f, i) => `
                        <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-sm); align-items: center;">
                            <code style="min-width: 120px; padding: var(--space-sm); background: var(--bg-primary); border-radius: var(--radius-sm); font-family: var(--font-mono);">{${escapeHtml(f.key)}}</code>
                            <input class="input" placeholder="Prompt for player" value="${escapeHtml(f.label)}"
                                   oninput="updateFieldLabel(${i}, this.value)">
                        </div>
                    `).join('')
                }
            </div>
        </div>

        <div class="actions">
            <button class="btn" onclick="saveStory()">Save Story</button>
        </div>
    `;
}

function updateMadlibPrompt() {
    isDirty = true;
    story.madlib_template.prompt = document.getElementById('madlib-prompt').value;
    // Auto-detect fields
    const matches = story.madlib_template.prompt.match(/\{(\w+)\}/g) || [];
    const keys = [...new Set(matches.map(m => m.slice(1, -1)))];

    // Preserve existing labels where possible
    const oldFields = Object.fromEntries(story.madlib_template.fields.map(f => [f.key, f.label]));
    story.madlib_template.fields = keys.map(key => ({
        key,
        label: oldFields[key] || `Enter a ${key}`
    }));

    // Re-render the fields section only
    const fieldsEl = document.getElementById('madlib-fields');
    if (fieldsEl) {
        fieldsEl.innerHTML = story.madlib_template.fields.length === 0
            ? '<p style="color: var(--text-secondary);">No fields yet. Add {key} placeholders to the template above.</p>'
            : story.madlib_template.fields.map((f, i) => `
                <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-sm); align-items: center;">
                    <code style="min-width: 120px; padding: var(--space-sm); background: var(--bg-primary); border-radius: var(--radius-sm); font-family: var(--font-mono);">{${escapeHtml(f.key)}}</code>
                    <input class="input" placeholder="Prompt for player" value="${escapeHtml(f.label)}"
                           oninput="updateFieldLabel(${i}, this.value)">
                </div>
            `).join('');
    }
}

function updateFieldLabel(index, label) {
    isDirty = true;
    if (story.madlib_template.fields[index]) {
        story.madlib_template.fields[index].label = label;
    }
}

function showSettings() {
    currentView = 'settings';
    currentSceneId = null;
    renderSidebar();
    const panel = document.getElementById('main-panel');
    panel.innerHTML = `
        <h2>Story Settings</h2>

        <div class="form-group">
            <label>Story Title</label>
            <input class="input" id="story-title-input" value="${escapeHtml(story.title)}"
                   oninput="updateStoryTitle(this.value)">
        </div>

        <div class="form-group">
            <label>Starting HP</label>
            <input class="input" type="number" id="starting-hp" min="1" max="10"
                   value="${story.settings.starting_hp}" onchange="updateStartingHp()">
        </div>

        <div class="form-group">
            <label>Theme</label>
            <div class="theme-picker">
                ${['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror'].map(t => `
                    <div class="theme-swatch theme-swatch--${t} ${story.theme === t ? 'theme-swatch--active' : ''}"
                         onclick="setTheme('${t}')" title="${t}"></div>
                `).join('')}
            </div>
            <p style="color: var(--text-secondary); margin-top: var(--space-sm); font-size: 0.875rem;">
                Current: <strong>${story.theme}</strong>
            </p>
        </div>

        <div class="actions">
            <button class="btn" onclick="saveStory()">Save Story</button>
        </div>
    `;
}

function updateStoryTitle(title) {
    isDirty = true;
    story.title = title;
    document.getElementById('story-name').textContent = title;
}

function updateStartingHp() {
    isDirty = true;
    story.settings.starting_hp = parseInt(document.getElementById('starting-hp').value, 10);
}

function setTheme(theme) {
    isDirty = true;
    story.theme = theme;
    showSettings();
}

async function saveStory() {
    try {
        await API.updateStory(storyId, story);
        isDirty = false;
        showToast();
    } catch (e) {
        alert('Failed to save: ' + e.message);
    }
}

function showToast() {
    const toast = document.getElementById('save-toast');
    toast.classList.add('save-toast--visible');
    setTimeout(() => toast.classList.remove('save-toast--visible'), 2000);
}

function insertVariable(textareaId, key) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.slice(0, start) + `{${key}}` + text.slice(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + key.length + 2;
    updateScene();
}

function toggleChoiceVars(index) {
    const menu = document.getElementById(`choice-vars-${index}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

function insertChoiceVariable(index, key) {
    const input = document.getElementById(`choice-text-${index}`);
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    input.value = text.slice(0, start) + `{${key}}` + text.slice(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + key.length + 2;
    updateChoiceText(index, input.value);

    // Hide the dropdown
    const menu = document.getElementById(`choice-vars-${index}`);
    if (menu) menu.style.display = 'none';
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

function setupDragDrop() {
    const items = document.querySelectorAll('.scene-item');
    items.forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', item.dataset.id);
            item.classList.add('scene-item--dragging');
        });
        item.addEventListener('dragend', e => {
            item.classList.remove('scene-item--dragging');
            // Remove all drag-over indicators
            document.querySelectorAll('.scene-item--drag-over').forEach(el => {
                el.classList.remove('scene-item--drag-over');
            });
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('scene-item--drag-over');
        });
        item.addEventListener('dragleave', e => {
            item.classList.remove('scene-item--drag-over');
        });
        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('scene-item--drag-over');
            const draggedId = e.dataTransfer.getData('text/plain');
            const targetId = item.dataset.id;
            if (draggedId === targetId) return;

            isDirty = true;
            const draggedIdx = story.scenes.findIndex(s => s.id === draggedId);
            const targetIdx = story.scenes.findIndex(s => s.id === targetId);
            const [dragged] = story.scenes.splice(draggedIdx, 1);
            story.scenes.splice(targetIdx, 0, dragged);
            renderSidebar();
        });
    });
}

loadStory();
