// static/js/sse.js
class SSEClient {
    constructor(onStateUpdate) {
        this.onStateUpdate = onStateUpdate;
        this.eventSource = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this._reconnectTimer = null;
    }

    connect() {
        if (this.eventSource) {
            this.eventSource.close();
        }
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }

        this.eventSource = new EventSource('/api/events');

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'state') {
                    this.onStateUpdate(data);
                }
            } catch (e) {
                console.error('SSE parse error:', e);
            }
        };

        this.eventSource.onerror = () => {
            this.eventSource.close();
            this.eventSource = null;
            console.log(`SSE reconnecting in ${this.reconnectDelay}ms...`);
            this._reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
            this.reconnectDelay = Math.min(
                this.reconnectDelay * 2,
                this.maxReconnectDelay
            );
        };

        this.eventSource.onopen = () => {
            this.reconnectDelay = 1000;
        };
    }

    disconnect() {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
}
