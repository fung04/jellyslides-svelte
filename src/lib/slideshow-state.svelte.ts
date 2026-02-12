import type { SlideItem, NowPlayingItem } from './types';

class SlideshowState {
    // UI State
    showInfoPanel = $state(true);
    showOptionsMenu = $state(false);

    // Playback State
    isPlaying = $state(true);

    // WebSocket / Remote Control State
    isWebSocketConnected = $state(false);
    isRemoteControlling = $state(false); // True when WS is dictating the content

    // The functional "Now Playing" content (could be from slideshow or WS)
    activeSlide = $state<SlideItem | null>(null);

    // If remote controlling, this holds the raw item
    remoteMediaItem = $state<NowPlayingItem | null>(null);

    // Helpers to toggle UI
    toggleInfoPanel() {
        this.showInfoPanel = !this.showInfoPanel;
    }

    toggleOptionsMenu() {
        this.showOptionsMenu = !this.showOptionsMenu;
    }
}

export const slideshowState = new SlideshowState();
