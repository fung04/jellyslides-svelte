import { WebSocketClient } from './websocket';
import { slideshowState } from './slideshow-state.svelte';
import type { ServerConfig, SessionData, NowPlayingItem } from './types';
import { JellyfinApi } from './jellyfinApi';

let wsClient: WebSocketClient | null = null;
let api: JellyfinApi | null = null;
let previousDeviceId: string | null = null;
let previousMediaId: string | null = null;
let mediaEndTimeoutId: any = null;
let mediaIdleTimeoutId: any = null;

export function initWebSocket(config: ServerConfig) {
    if (wsClient) {
        wsClient.disconnect();
    }

    api = new JellyfinApi(config);

    wsClient = new WebSocketClient({
        serverAddress: config.baseUrl,
        apiKey: config.accessToken,
        deviceId: config.deviceId,
        onConnect: () => {
            console.log('WS Connected');
            slideshowState.isWebSocketConnected = true;
            // Send initial messages
            wsClient?.sendMessage("SessionsStart", "0, 1500");
        },
        onMessage: (msg) => {
            if (msg.MessageType === 'Sessions') {
                processSessionMessage(msg.Data);
            }
        },
        onClose: () => {
            console.log('WS Closed');
            slideshowState.isWebSocketConnected = false;
        }
    });

    wsClient.connect();
}

export function disconnectWebSocket() {
    if (wsClient) {
        wsClient.disconnect();
        wsClient = null;
    }
}

function processSessionMessage(data: SessionData[]) {
    if (!data || !Array.isArray(data)) return;

    // 1. Find relevant session
    let session: SessionData | undefined;

    // Priority 1: Match previous device ID
    if (previousDeviceId) {
        session = data.find(s => s.DeviceId === previousDeviceId);
    }

    // Priority 2: Find any playing video/audio
    if (!session) {
        session = data.find(s =>
            s.PlayState && !s.PlayState.IsPaused && s.NowPlayingItem
        );
    }

    if (!session) {
        // No active session found.
        if (slideshowState.isRemoteControlling && !previousDeviceId) {
            // If we were blindly controlling a session and it vanished
        }
        return;
    }

    // 2. Extract Data
    const { PlayState, NowPlayingItem, DeviceId } = session;
    if (!PlayState || !NowPlayingItem) return;

    previousDeviceId = DeviceId;

    const isPlaying = !PlayState.IsPaused;
    const mediaId = NowPlayingItem.Id;

    // 3. Logic
    if (isPlaying) {
        // Playback is active
        clearTimeout(mediaIdleTimeoutId);
        clearTimeout(mediaEndTimeoutId);

        if (previousMediaId !== mediaId) {
            // New Media
            console.log(`New Media Detected: ${NowPlayingItem.Name}`);
            previousMediaId = mediaId;
            updateActiveSlide(NowPlayingItem);
        } else if (!slideshowState.isRemoteControlling) {
            // Same media, but we weren't controlling yet (maybe resumed)
            console.log('Taking Control (Resumed)');
            updateActiveSlide(NowPlayingItem);
        } else {
            // Same media, already controlling.
            // Just ensure we are in control mode
            slideshowState.isRemoteControlling = true;
        }

        // Set Timeout for end of media
        const runTimeTicks = NowPlayingItem.RunTimeTicks; // 100ns units
        const positionTicks = PlayState.PositionTicks || 0;

        if (runTimeTicks && runTimeTicks > 0) {
            const remainingTicks = runTimeTicks - positionTicks;
            if (remainingTicks > 0) {
                const remainingMs = remainingTicks / 10000;
                const bufferMs = 2000; // 2 seconds buffer

                mediaEndTimeoutId = setTimeout(() => {
                    console.log('Media End Timeout - Resetting State');
                    resetPlaybackState();
                }, remainingMs + bufferMs);
            } else {
                console.log('Media ended (ticks) - Resetting State');
                resetPlaybackState();
            }
        }

    } else {
        // Paused
        if (slideshowState.isRemoteControlling) {
            console.log('Paused - Releasing Control');
            resetPlaybackState();
        }
    }
}

async function updateActiveSlide(item: NowPlayingItem) {
    if (!api) return;

    slideshowState.isRemoteControlling = true;
    slideshowState.remoteMediaItem = item;

    const isAudio = item.MediaType === 'Audio';
    const imageType = isAudio ? 'Primary' : 'Backdrop';

    // Extract Blurhash
    let blurhash = '';
    if (item.ImageBlurHashes) {
        // If Audio, try Primary, then others
        // If Backdrop, try Backdrop, then Primary
        if (isAudio) {
            blurhash = item.ImageBlurHashes.Primary || item.ImageBlurHashes.Backdrop || '';
        } else {
            blurhash = item.ImageBlurHashes.Backdrop || item.ImageBlurHashes.Primary || '';
        }
    }

    slideshowState.activeSlide = {
        id: item.Id,
        name: item.Name,
        overview: item.Overview || item.Album || '',
        type: item.MediaType,
        blurhash: blurhash,
        imageType: imageType,
        imageUrl: api.getImageUrl(item.Id, imageType)
    };
}

function resetPlaybackState() {
    slideshowState.isRemoteControlling = false;
    slideshowState.remoteMediaItem = null;
    previousMediaId = null;
    // previousDeviceId = null; // Keep device ID to stick to it
}
