
export interface ServerConfig {
    baseUrl: string;
    username: string;
    userId: string;
    accessToken: string;
    deviceId: string;
}

export interface AppConfig {
    pictureQuality: number;
    libraryParams: string[]; // e.g. "Movie,Series"
    duration: number; // in milliseconds
    wakeLock: boolean;
    websocket: boolean;
    transitionEffect: 'fade' | 'slide' | 'cube' | 'coverflow' | 'flip';
}

export interface SlideItem {
    id: string;
    name: string;
    overview: string;
    type: string;
    blurhash: string;
    imageType: string;
    imageUrl?: string;
}
