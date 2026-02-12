
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { ServerConfig, AppConfig } from './types.ts';

function persistentStore<T>(key: string, initialValue: T) {
    if (!browser) {
        return writable<T>(initialValue);
    }

    const storedValue = localStorage.getItem(key);
    const data: T = storedValue ? JSON.parse(storedValue) : initialValue;
    const store = writable<T>(data);

    store.subscribe((value) => {
        if (browser) {
            localStorage.setItem(key, JSON.stringify(value));
        }
    });

    return store;
}

export const serverConfig = persistentStore<ServerConfig | null>('serverConfig', null);

export const appConfig = persistentStore<AppConfig>('appConfig', {
    pictureResolution: 1080,
    pictureQuality: 100,
    libraryParams: ['Movie', 'Series'],
    duration: 30000,
    wakeLock: false,
    websocket: false,
    transitionEffect: 'fade',
});

export const slideshowState = writable({
    isPlaying: false,
    currentSlideIndex: 0,
});
