import type { ServerConfig } from './types';

export const ImageType = {
    backdrop: 'Backdrop',
    primary: 'Primary',
    thumbnail: 'Thumb'
};

export const VideoType = {
    movie: 'Movie',
    series: 'Series',
    season: 'Season',
    audio: 'Audio',
    episode: 'Episode',
    boxset: 'BoxSet'
};

export class JellyfinApi {
    private config: ServerConfig;

    constructor(config: ServerConfig) {
        this.config = config;
    }

    getImageUrl(videoId: string, imageType: string, quality: number = 100, resolution: number = 1080) {
        const { baseUrl, accessToken } = this.config;
        // Remove trailing slash if present
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        return `${cleanBaseUrl}/Items/${videoId}/Images/${imageType}?quality=${quality}&fillHeight=${resolution}&api_key=${accessToken}`;
    }

    async getVideoDetails(videoId: string) {
        const { baseUrl, accessToken } = this.config;
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const url = `${cleanBaseUrl}/Items/${videoId}?api_key=${accessToken}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to get video details');
        }
        return response.json();
    }

    async getUsers() {
        const { baseUrl, accessToken } = this.config;
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const url = `${cleanBaseUrl}/Users/Public`; // Public access usually, or check config

        // If we have an access token, use /Users
        if (accessToken) {
            const authUrl = `${cleanBaseUrl}/Users?api_key=${accessToken}`;
            const response = await fetch(authUrl);
            if (response.ok) return response.json();
        }

        // Fallback for public user list if available (often not exposed)
        const response = await fetch(`${cleanBaseUrl}/Users/Public`);
        if (response.ok) return response.json();
        throw new Error('Failed to fetch users');
    }

    async getViews(userId: string) {
        const { baseUrl, accessToken } = this.config;
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const url = `${cleanBaseUrl}/Users/${userId}/Views?api_key=${accessToken}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch user views');
        return response.json();
    }

    async authenticateUser(username: string, password?: string) {
        const { baseUrl } = this.config;
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const url = `${cleanBaseUrl}/Users/AuthenticateByName`;

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `MediaBrowser Client="JellySlides", Device="Web Client", DeviceId="${this.config.deviceId}", Version="1.0.0"`
        };

        const body = JSON.stringify({
            Username: username,
            Pw: password || ''
        });

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body
        });

        if (!response.ok) {
            throw new Error('Authentication failed');
        }

        return response.json();
    }

    /**
     * Explode a single Jellyfin item into multiple entries based on available image tags.
     * Audio items always return a single entry with imageType 'Primary'.
     */
    private explodeItemByImageType(item: any, videoType: string): any[] {
        const results: any[] = [];
        const imageTags = item['ImageTags'] || {};
        const backdropTags = item['BackdropImageTags'] || [];
        const blurHashes = item['ImageBlurHashes'] || {};

        let name = item['Name'] || '';
        if (videoType === VideoType.season) {
            const lowerName = name.toLowerCase();
            if (lowerName.includes('season') || lowerName.includes('special')) {
                name = item['SeriesName'] || name;
            }
        }

        const base = {
            id: item['Id'],
            name,
            overview: item['Overview'] || '',
            type: item['Type']
        };

        // Audio: always Primary only
        if (videoType === VideoType.audio) {
            if (imageTags['Primary'] && blurHashes['Primary']) {
                results.push({
                    ...base,
                    name: item['Album'] || item['Name'],
                    blurhash: blurHashes['Primary'],
                    overview: item['AlbumArtist'] || '',
                    imageType: ImageType.primary
                });
            }
            return results;
        }

        // Primary
        if (imageTags['Primary'] && blurHashes['Primary']) {
            results.push({
                ...base,
                blurhash: blurHashes['Primary'],
                imageType: ImageType.primary
            });
        }

        // Thumb
        if (imageTags['Thumb'] && blurHashes['Thumb']) {
            results.push({
                ...base,
                blurhash: blurHashes['Thumb'],
                imageType: ImageType.thumbnail
            });
        }

        // Backdrop
        if (backdropTags.length > 0 && blurHashes['Backdrop']) {
            results.push({
                ...base,
                blurhash: blurHashes['Backdrop'],
                imageType: ImageType.backdrop
            });
        }

        return results;
    }

    async getVideoIds({
        videoType,
        userId
    }: {
        videoType: string;
        userId: string;
    }) {
        const { baseUrl, accessToken } = this.config;
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const url = new URL(`${cleanBaseUrl}/Users/${userId}/Items`);

        url.searchParams.append('IncludeItemTypes', videoType);
        url.searchParams.append('Recursive', 'true');
        url.searchParams.append('fields', 'Overview,PremiereDate,CommunityRating,RecursiveItemCount');
        url.searchParams.append('api_key', accessToken);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error('Failed to get video ids');
        }

        const jsonData = await response.json();

        // Handle BoxSets (Collections)
        if (videoType === VideoType.boxset) {
            const parentIds = jsonData['Items'].map((item: any) => ({ id: item['Id'] }));
            const childResults = await Promise.all(
                parentIds.map((parentId: any) =>
                    this.fetchAndProcessChildItems({
                        parentId,
                        userId,
                        videoType
                    })
                )
            );
            return childResults.flat();
        }

        // Handle Audio – deduplicate by album first
        if (videoType === VideoType.audio) {
            const uniqueItems: Record<string, any> = {};
            jsonData['Items'].forEach((item: any) => {
                const key = item['AlbumId'] || item['Album'] || item['Id'];
                uniqueItems[key] = item;
            });

            return Object.values(uniqueItems).flatMap((item: any) =>
                this.explodeItemByImageType(item, videoType)
            );
        }

        // Default handling (Movies, Series, Seasons)
        return jsonData['Items'].flatMap((item: any) =>
            this.explodeItemByImageType(item, videoType)
        );
    }

    async fetchAndProcessChildItems({
        parentId,
        userId,
        videoType
    }: {
        parentId: { id: string };
        userId: string;
        videoType: string;
    }) {
        const { baseUrl, accessToken } = this.config;
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const url = new URL(`${cleanBaseUrl}/Users/${userId}/Items`);

        url.searchParams.append('ParentId', parentId.id);
        url.searchParams.append('api_key', accessToken);
        url.searchParams.append('fields', 'Overview,PremiereDate,CommunityRating,RecursiveItemCount');

        const response = await fetch(url.toString());
        if (!response.ok) {
            console.error(`Failed to fetch child items for parent ${parentId.id}`);
            return [];
        }

        const childJsonData = await response.json();

        return childJsonData['Items'].flatMap((item: any) =>
            this.explodeItemByImageType(item, videoType)
        );
    }
}

