
export function generateDeviceId(): string {
    // Check if one exists in localStorage first
    if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('deviceId');
        if (stored) return stored;
    }

    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0,
            v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });

    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('deviceId', id);
    }

    return id;
}

export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
