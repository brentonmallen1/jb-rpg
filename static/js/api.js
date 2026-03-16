// static/js/api.js
const API = {
    async getStories() {
        const res = await fetch('/api/stories');
        return res.json();
    },

    async getStory(id) {
        const res = await fetch(`/api/stories/${id}`);
        if (!res.ok) throw new Error('Story not found');
        return res.json();
    },

    async createStory(title) {
        const res = await fetch('/api/stories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        return res.json();
    },

    async updateStory(id, story) {
        const res = await fetch(`/api/stories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(story)
        });
        return res.json();
    },

    async deleteStory(id) {
        await fetch(`/api/stories/${id}`, { method: 'DELETE' });
    },

    async getState() {
        const res = await fetch('/api/state');
        return res.json();
    },

    async startSession(storyId) {
        const res = await fetch('/api/state/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ story_id: storyId })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to start session');
        }
        return res.json();
    },

    async submitMadlib(answer) {
        const res = await fetch('/api/state/madlib', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answer })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to submit madlib');
        }
        return res.json();
    },

    async makeChoice(choiceIndex) {
        const res = await fetch('/api/state/choice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ choice_index: choiceIndex })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to make choice');
        }
        return res.json();
    },

    async goBack() {
        const res = await fetch('/api/state/back', { method: 'POST' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to go back');
        }
        return res.json();
    },

    async finish(outcome) {
        const res = await fetch('/api/state/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to finish');
        }
        return res.json();
    },

    async restart() {
        const res = await fetch('/api/state/restart', { method: 'POST' });
        return res.json();
    }
};
