// static/js/api.js
const API = {
    // Session token for storyteller authentication
    _sessionToken: sessionStorage.getItem('jb_rpg_session_token'),

    _getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this._sessionToken) {
            headers['X-Session-Token'] = this._sessionToken;
        }
        return headers;
    },

    setSessionToken(token) {
        this._sessionToken = token;
        if (token) {
            sessionStorage.setItem('jb_rpg_session_token', token);
        } else {
            sessionStorage.removeItem('jb_rpg_session_token');
        }
    },

    async getStories() {
        const res = await fetch('/api/stories');
        if (!res.ok) throw new Error(`Failed to fetch stories: ${res.status}`);
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
        if (!res.ok) throw new Error(`Failed to create story: ${res.status}`);
        return res.json();
    },

    async updateStory(id, story) {
        const res = await fetch(`/api/stories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(story)
        });
        if (!res.ok) throw new Error(`Failed to update story: ${res.status}`);
        return res.json();
    },

    async deleteStory(id) {
        const res = await fetch(`/api/stories/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Failed to delete story: ${res.status}`);
    },

    async getState() {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`);
        return res.json();
    },

    async validateToken() {
        const headers = {};
        if (this._sessionToken) {
            headers['X-Session-Token'] = this._sessionToken;
        }
        const res = await fetch('/api/state/validate-token', { headers });
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
        const data = await res.json();
        // Store the session token
        this.setSessionToken(data.token);
        return data.state;
    },

    async submitMadlib(answer) {
        const res = await fetch('/api/state/madlib', {
            method: 'POST',
            headers: this._getAuthHeaders(),
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
            headers: this._getAuthHeaders(),
            body: JSON.stringify({ choice_index: choiceIndex })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to make choice');
        }
        return res.json();
    },

    async goBack() {
        const res = await fetch('/api/state/back', {
            method: 'POST',
            headers: this._getAuthHeaders()
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to go back');
        }
        return res.json();
    },

    async finish(outcome) {
        const res = await fetch('/api/state/finish', {
            method: 'POST',
            headers: this._getAuthHeaders(),
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
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to restart');
        }
        // Clear the session token
        this.setSessionToken(null);
        return res.json();
    },

    async revealChoices() {
        const res = await fetch('/api/state/reveal-choices', {
            method: 'POST',
            headers: this._getAuthHeaders()
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Failed to reveal choices');
        }
        return res.json();
    }
};
