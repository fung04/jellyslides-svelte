
export interface ServerConfig {
    baseUrl: string;
    username: string;
    userId: string;
    accessToken: string;
    deviceId: string;
}

export interface AppConfig {
    pictureResolution: number;
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
    productionYear?: number;
    backdropItemId?: string;
}

export interface NowPlayingItem {
    Name: string;
    Id: string;
    MediaType: string;
    RunTimeTicks: number;
    Overview?: string;
    Album?: string;
    ProductionYear?: number;
    PrimaryImageAspectRatio?: number;
    ImageBlurHashes?: {
        Primary?: string;
        Backdrop?: string;
        Thumb?: string;
        [key: string]: string | undefined;
    };
}

export interface PlayState {
    IsPaused: boolean;
    PositionTicks?: number;
}

export interface SessionData {
    DbContextId?: string;
    DeviceId: string;
    NowPlayingItem?: NowPlayingItem;
    PlayState?: PlayState;
}

export interface WebSocketMessage {
    MessageType: string;
    Data?: any;
}
