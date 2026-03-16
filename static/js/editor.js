// static/js/editor.js
let story = null;
let currentView = null; // 'scene', 'madlib', 'settings'
let currentSceneId = null;
let isDirty = false;  // Track unsaved changes
let autoSaveTimer = null;  // Debounce timer for auto-save

// Mark story as dirty and trigger auto-save
function markDirty() {
    isDirty = true;
    // Clear existing timer
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    // Set new timer for 1 second
    autoSaveTimer = setTimeout(autoSave, 1000);
}

async function autoSave() {
    if (!isDirty || !story) return;
    try {
        showToast('Saving...');
        await API.updateStory(storyId, story);
        isDirty = false;
        showToast('Saved');
    } catch (e) {
        showToast('Save failed!');
        console.error('Auto-save failed:', e);
    }
}

// Preset mad lib templates for quick character creation
// Questions are intentionally indirect to avoid giving away how answers will be used
const BUILTIN_PRESETS = {
    classic_hero: {
        name: 'Classic Hero',
        prompt: '{name} the {profession} has a secret weakness: {weakness}. They journey forth to {quest}.',
        fields: [
            { key: 'name', label: 'If you could name a constellation, what would you call it?' },
            { key: 'profession', label: 'What job would you do if money didn\'t matter?' },
            { key: 'weakness', label: 'What keeps you up at 3am?' },
            { key: 'quest', label: 'If you had one wish, what would it be?' }
        ]
    },
    mysterious_stranger: {
        name: 'Mysterious Stranger',
        prompt: 'They go by {alias}, but no one knows their true name. They carry the weight of {secret} and fear nothing except {fear}. Now they seek {goal}.',
        fields: [
            { key: 'alias', label: 'What would your spy codename be?' },
            { key: 'secret', label: 'What\'s something you\'ve never told anyone?' },
            { key: 'fear', label: 'What sound makes you uncomfortable?' },
            { key: 'goal', label: 'What would you search for in an abandoned library?' }
        ]
    },
    unlikely_champion: {
        name: 'Unlikely Champion',
        prompt: '{name} was just a simple {job} until they discovered they could {talent}. Now, driven by {motivation}, they must become something more.',
        fields: [
            { key: 'name', label: 'What name would you give to a friendly ghost?' },
            { key: 'job', label: 'What\'s the most boring job you can think of?' },
            { key: 'talent', label: 'What would be an absurd superpower?' },
            { key: 'motivation', label: 'What makes you get out of bed in the morning?' }
        ]
    },
    fallen_noble: {
        name: 'Fallen Noble',
        prompt: 'Once known as {title}, they ruled over {domain}. But {downfall} stripped everything away. Now they wander, seeking {redemption}.',
        fields: [
            { key: 'title', label: 'What would your royal title be?' },
            { key: 'domain', label: 'What place feels like home to you?' },
            { key: 'downfall', label: 'What\'s the worst way to lose a game?' },
            { key: 'redemption', label: 'What would you do with a second chance?' }
        ]
    },
    scrappy_survivor: {
        name: 'Scrappy Survivor',
        prompt: 'On the streets they call them {nickname}. They grew up in {origin} and learned to survive by {skill}. But deep down, they dream of {dream}.',
        fields: [
            { key: 'nickname', label: 'What nickname did you have as a kid?' },
            { key: 'origin', label: 'Describe a place that smells like memories.' },
            { key: 'skill', label: 'What\'s something you\'re surprisingly good at?' },
            { key: 'dream', label: 'What would you do if you won the lottery?' }
        ]
    }
};

// Custom presets stored in localStorage
const CUSTOM_PRESETS_KEY = 'jb_rpg_custom_madlib_presets';

function getCustomPresets() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY)) || {};
    } catch {
        return {};
    }
}

function saveCustomPresets(presets) {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

function getAllPresets() {
    return { ...BUILTIN_PRESETS, ...getCustomPresets() };
}

function isBuiltinPreset(key) {
    return key in BUILTIN_PRESETS;
}

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
        ThemeManager.setTheme(story.theme);
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
    markDirty();
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
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    scene.choices[index].kind = kind;
    if (kind !== 'item') scene.choices[index].item_name = null;
    renderSceneEditor();
}

function updateChoiceText(index, text) {
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.choices[index].text = text;
}

function updateChoiceItem(index, name) {
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.choices[index].item_name = name;
}

function addConditional() {
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    scene.conditional_text.push({
        condition: { type: 'hp', op: 'lte', value: 1, scene_id: null, outcome: null },
        text: ''
    });
    renderSceneEditor();
}

function removeConditional(index) {
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    scene.conditional_text.splice(index, 1);
    renderSceneEditor();
}

function updateConditionType(index, type) {
    markDirty();
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
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].condition.op = op;
}

function updateConditionValue(index, value) {
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].condition.value = parseInt(value, 10);
}

function updateConditionSceneId(index, sceneId) {
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].condition.scene_id = sceneId;
}

function updateConditionOutcome(index, outcome) {
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].condition.outcome = outcome;
}

function updateConditionText(index, text) {
    markDirty();
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (scene) scene.conditional_text[index].text = text;
}

function addScene() {
    markDirty();
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
    markDirty();
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
    const allPresets = getAllPresets();

    panel.innerHTML = `
        <h2>Mad Libs Template</h2>

        <div class="form-group">
            <label>Start from a preset</label>
            <div class="preset-list">
                ${Object.entries(allPresets).map(([key, preset]) => {
                    const isCustom = !isBuiltinPreset(key);
                    return `
                        <div class="preset-chip ${isCustom ? 'preset-chip--custom' : ''}" onclick="applyPreset('${escapeAttr(key)}')">
                            <span>${escapeHtml(preset.name)}</span>
                            ${isCustom ? `<button class="preset-chip__delete" onclick="deleteCustomPreset('${escapeAttr(key)}', event)" title="Delete preset">&times;</button>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
            <p style="color: var(--text-secondary); margin-top: var(--space-xs); font-size: 0.875rem;">
                Click a preset to load it, then customize below.
            </p>
        </div>

        <div class="form-group">
            <label>Template Text</label>
            <textarea class="input" id="madlib-prompt" oninput="updateMadlibPrompt()">${escapeHtml(story.madlib_template.prompt)}</textarea>
            <p style="color: var(--text-secondary); margin-top: var(--space-xs); font-size: 0.875rem;">Use {key} to define placeholders. Fields are auto-detected.</p>
        </div>

        <div class="form-group">
            <label>Fields</label>
            <p style="color: var(--text-secondary); margin-bottom: var(--space-sm); font-size: 0.875rem;">
                For each placeholder, write the question players will see.
            </p>
            ${story.madlib_template.fields.length === 0
                ? '<p id="madlib-fields" style="color: var(--text-secondary);">No fields yet. Add {key} placeholders to the template above.</p>'
                : `<div id="madlib-fields" class="madlib-fields-scroll">${renderMadlibFields()}</div>`
            }
        </div>

        <details class="form-group" style="border: 1px solid var(--text-secondary); border-radius: var(--radius-md); padding: var(--space-md);">
            <summary style="cursor: pointer; font-weight: 500; color: var(--accent);">Question Writing Tips</summary>
            <div style="margin-top: var(--space-md); color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6;">
                <p style="margin-bottom: var(--space-sm);"><strong>Make questions indirect!</strong> Don't reveal how answers will be used.</p>
                <ul style="margin-left: var(--space-md); margin-bottom: var(--space-sm);">
                    <li>Instead of "What's your weakness?" ask "What keeps you up at 3am?"</li>
                    <li>Instead of "What's your goal?" ask "If you had one wish, what would it be?"</li>
                    <li>Instead of "What's your job?" ask "What would you do if money didn't matter?"</li>
                    <li>Instead of "What's your fear?" ask "What sound makes you uncomfortable?"</li>
                    <li>Instead of "Where are you from?" ask "Describe a place that smells like memories."</li>
                </ul>
                <p>The magic happens when players don't know how their answers will be woven into the story!</p>
            </div>
        </details>

        <div class="actions">
            <button class="btn" onclick="saveStory()">Save Story</button>
            <button class="btn btn--secondary" onclick="saveAsPreset()">Save as Preset</button>
            <button class="btn btn--danger" onclick="clearMadlibTemplate()">Clear</button>
        </div>
    `;
}

function renderMadlibFields() {
    return story.madlib_template.fields.map((f, i) => `
        <div class="madlib-field-card">
            <div class="madlib-field-header">
                <code class="madlib-field-key">{${escapeHtml(f.key)}}</code>
            </div>
            <div class="madlib-field-body">
                <label class="madlib-field-label">Question shown to players:</label>
                <input class="input" value="${escapeHtml(f.label)}" oninput="updateFieldLabel(${i}, this.value)">
            </div>
        </div>
    `).join('');
}

function updateMadlibPrompt() {
    markDirty();
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

    // Re-render the fields section - need to replace the element since structure changes
    const fieldsEl = document.getElementById('madlib-fields');
    if (fieldsEl) {
        if (story.madlib_template.fields.length === 0) {
            const p = document.createElement('p');
            p.id = 'madlib-fields';
            p.style.color = 'var(--text-secondary)';
            p.textContent = 'No fields yet. Add {key} placeholders to the template above.';
            fieldsEl.replaceWith(p);
        } else {
            const div = document.createElement('div');
            div.id = 'madlib-fields';
            div.className = 'madlib-fields-scroll';
            div.innerHTML = renderMadlibFields();
            fieldsEl.replaceWith(div);
        }
    }
}

function updateFieldLabel(index, label) {
    markDirty();
    if (story.madlib_template.fields[index]) {
        story.madlib_template.fields[index].label = label;
    }
}

function applyPreset(presetKey) {
    if (!presetKey) return;
    const allPresets = getAllPresets();
    const preset = allPresets[presetKey];
    if (!preset) return;

    markDirty();
    // Apply the preset
    story.madlib_template.prompt = preset.prompt;
    story.madlib_template.fields = preset.fields.map(f => ({ ...f }));

    // Re-render the editor
    showMadlibEditor();
}

function saveAsPreset() {
    const name = prompt('Enter a name for this preset:');
    if (!name || !name.trim()) return;

    // Validate we have something to save
    if (!story.madlib_template.prompt.trim()) {
        alert('Cannot save an empty template.');
        return;
    }

    // Generate a key from the name
    const key = 'custom_' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // Check if it would overwrite a builtin
    if (isBuiltinPreset(key)) {
        alert('Cannot overwrite a built-in preset.');
        return;
    }

    const customPresets = getCustomPresets();
    customPresets[key] = {
        name: name.trim(),
        prompt: story.madlib_template.prompt,
        fields: story.madlib_template.fields.map(f => ({ ...f }))
    };
    saveCustomPresets(customPresets);

    showMadlibEditor();
    showToast('Preset saved!');
}

function deleteCustomPreset(key, event) {
    event.stopPropagation();
    if (!confirm('Delete this preset?')) return;

    const customPresets = getCustomPresets();
    delete customPresets[key];
    saveCustomPresets(customPresets);

    showMadlibEditor();
}

function clearMadlibTemplate() {
    if (!confirm('Clear the template and start fresh?')) return;

    markDirty();
    story.madlib_template.prompt = '';
    story.madlib_template.fields = [];

    showMadlibEditor();
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
                ${['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror', 'insanity'].map(t => `
                    <button type="button" class="theme-btn theme-btn--${t} ${story.theme === t ? 'theme-btn--active' : ''}"
                         onclick="setTheme('${t}')">${t.replace('_', ' ')}</button>
                `).join('')}
            </div>
            <p style="color: var(--text-secondary); margin-top: var(--space-sm); font-size: 0.875rem;">
                Selected: <strong>${story.theme.replace('_', ' ')}</strong>
            </p>
        </div>

        <div class="actions">
            <button class="btn" onclick="saveStory()">Save Story</button>
        </div>
    `;
}

function updateStoryTitle(title) {
    markDirty();
    story.title = title;
    document.getElementById('story-name').textContent = title;
}

function updateStartingHp() {
    markDirty();
    story.settings.starting_hp = parseInt(document.getElementById('starting-hp').value, 10);
}

function setTheme(theme) {
    markDirty();
    story.theme = theme;
    ThemeManager.setTheme(theme);
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

function showToast(message = 'Story saved!') {
    const toast = document.getElementById('save-toast');
    toast.textContent = message;
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

            markDirty();
            const draggedIdx = story.scenes.findIndex(s => s.id === draggedId);
            const targetIdx = story.scenes.findIndex(s => s.id === targetId);
            const [dragged] = story.scenes.splice(draggedIdx, 1);
            story.scenes.splice(targetIdx, 0, dragged);
            renderSidebar();
        });
    });
}

loadStory();
