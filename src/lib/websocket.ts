export interface WebSocketOptions {
    serverAddress: string;
    apiKey: string;
    deviceId: string;
    protocol?: string;
    port?: string;
    onMessage?: (msg: any) => void;
    onConnect?: () => void;
    onError?: (error: any) => void;
    onClose?: (event: CloseEvent) => void;
    onUnexpectedClose?: () => void;
}

export class WebSocketClient {
    private serverAddress: string;
    private apiKey: string;
    private deviceId: string;
    private protocol: string;
    private port: string;
    private _webSocket: WebSocket | null = null;
    private keepAliveInterval: any = null;

    private onMessageCallback: (msg: any) => void;
    private onConnectCallback: () => void;
    private onErrorCallback: (error: any) => void;
    private onCloseCallback: (event: CloseEvent) => void;
    private onUnexpectedClose: () => void;

    constructor(options: WebSocketOptions) {
        this.serverAddress = options.serverAddress;
        this.apiKey = options.apiKey;
        this.deviceId = options.deviceId;
        this.protocol = options.protocol || 'wss';
        this.port = options.port || '';

        this.onMessageCallback = options.onMessage || ((msg) => console.log('Message received:', msg));
        this.onConnectCallback = options.onConnect || (() => console.log('WebSocket connected!'));
        this.onErrorCallback = options.onError || ((error) => console.error('WebSocket error:', error));
        this.onCloseCallback = options.onClose || (() => console.log('WebSocket closed'));
        this.onUnexpectedClose = options.onUnexpectedClose || (() => console.log('WebSocket closed unexpectedly'));
    }

    connect() {
        if (this.isWebSocketOpenOrConnecting()) {
            console.log('WebSocket is already open or connecting');
            return;
        }

        if (!this.isWebSocketSupported()) {
            console.error('WebSocket is not supported in this browser');
            return;
        }

        try {
            this.openWebSocket();
        } catch (err) {
            console.error(`Error opening WebSocket: ${err}`);
            this.onErrorCallback(err);
        }
    }

    private openWebSocket() {
        if (!this.apiKey) {
            throw new Error('Cannot open WebSocket without API key');
        }

        const portStr = this.port ? `:${this.port}` : '';
        // Ensure we strip http/https if present in serverAddress
        let host = this.serverAddress.replace(/^https?:\/\//, '');
        // If serverAddress had a port, it might be in host now.
        // If the user provided a port separately, use it. Otherwise rely on host.
        // The original code constructed: protocol://serverAddress:port/socket

        // Remove trailing slash
        if (host.endsWith('/')) {
            host = host.slice(0, -1);
        }

        const url = `${this.protocol}://${host}${portStr}/socket`;
        const fullUrl = `${url}?api_key=${encodeURIComponent(this.apiKey)}&deviceId=${encodeURIComponent(this.deviceId)}`;

        console.log(`Opening WebSocket connection to: ${fullUrl}`);

        const webSocket = new WebSocket(fullUrl);

        webSocket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                // console.log('Message received:', msg);

                if (msg.MessageType === 'KeepAlive') {
                    // console.debug('Received KeepAlive from server.');
                } else if (msg.MessageType === 'ForceKeepAlive') {
                    console.debug(`Received ForceKeepAlive. Timeout: ${msg.Data}s.`);
                    this.sendMessage('KeepAlive');
                    this.scheduleKeepAlive(msg.Data);
                }

                this.onMessageCallback(msg);
            } catch (err) {
                console.error('Error parsing WebSocket message:', err, event.data);
            }
        };

        webSocket.onopen = () => {
            console.log('WebSocket connection opened successfully');
            this.onConnectCallback();
        };

        webSocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.onErrorCallback(error);
        };

        webSocket.onclose = (event) => {
            console.log('WebSocket connection closed', {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
            });

            this.clearKeepAlive();

            if (this._webSocket === webSocket) {
                this._webSocket = null;
            }

            if (!event.wasClean) {
                this.onUnexpectedClose();
            }

            this.onCloseCallback(event);
        };

        this._webSocket = webSocket;
    }

    sendMessage(messageType: string, data?: any): boolean {
        if (!this.isWebSocketOpen()) {
            console.error('Cannot send message: WebSocket is not open');
            return false;
        }

        const msg: any = { MessageType: messageType };
        if (data !== undefined) {
            msg.Data = data;
        }

        try {
            this._webSocket!.send(JSON.stringify(msg));
            return true;
        } catch (e) {
            console.error('Failed to send message', e);
            return false;
        }
    }

    disconnect() {
        if (this._webSocket && this.isWebSocketOpen()) {
            this._webSocket.close();
        }
    }

    isWebSocketOpen() {
        return this._webSocket && this._webSocket.readyState === WebSocket.OPEN;
    }

    isWebSocketOpenOrConnecting() {
        return this._webSocket &&
            (this._webSocket.readyState === WebSocket.OPEN ||
                this._webSocket.readyState === WebSocket.CONNECTING);
    }

    isWebSocketSupported() {
        return typeof WebSocket !== 'undefined';
    }

    scheduleKeepAlive(timeout: number) {
        this.clearKeepAlive();
        const intervalTime = Math.max(10, timeout * 1000 * 0.5);
        this.keepAliveInterval = setInterval(() => {
            this.sendMessage('KeepAlive');
        }, intervalTime);
    }

    clearKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }
}
