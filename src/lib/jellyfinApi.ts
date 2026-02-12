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

    async getVideoIds({
        videoType,
        imageType,
        userId
    }: {
        videoType: string;
        imageType: string;
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
        const hashtype =
            imageType === ImageType.backdrop
                ? 'Backdrop'
                : imageType === ImageType.thumbnail
                    ? 'Thumb'
                    : 'Primary';

        // Handle BoxSets (Collections)
        if (videoType === VideoType.boxset) {
            const parentIds = jsonData['Items'].map((item: any) => ({ id: item['Id'] }));
            const childResults = await Promise.all(
                parentIds.map((parentId: any) =>
                    this.fetchAndProcessChildItems({
                        parentId,
                        userId,
                        videoType,
                        imageType,
                        hashtype
                    })
                )
            );
            return childResults.flat();
        }

        // Handle Audio
        if (videoType === VideoType.audio) {
            const uniqueItems: Record<string, any> = {};
            jsonData['Items'].forEach((item: any) => {
                const key = item['AlbumId'] || item['Album'] || item['Id'];
                uniqueItems[key] = item;
            });

            return Object.values(uniqueItems)
                .filter(
                    (item: any) =>
                        item['ImageTags']?.['Primary'] ||
                        (item['BackdropImageTags'] && item['ImageBlurHashes']?.[hashtype])
                )
                .map((item: any) => ({
                    id:
                        item['ImageTags']?.['Primary'] ||
                            (item['BackdropImageTags'] && item['BackdropImageTags'].length > 0)
                            ? item['Id']
                            : item['AlbumId'],
                    name: item['Album'] || item['Name'],
                    type: item['Type'],
                    overview: item['Overview'] || '',
                    blurhash: item['ImageBlurHashes']?.[hashtype],
                    imageType: imageType
                }));
        }

        // Default handling (Movies, Series, Seasons)
        const filteredItems = jsonData['Items'].filter(
            (item: any) =>
                item['ImageTags'] && item['ImageBlurHashes'] && item['ImageBlurHashes'][hashtype]
        );

        return filteredItems.map((item: any) => {
            let name = item['Name'] || '';
            if (videoType === VideoType.season) {
                const lowerName = name.toLowerCase();
                if (lowerName.includes('season') || lowerName.includes('special')) {
                    name = item['SeriesName'] || name;
                }
            }

            return {
                id: item['Id'],
                name: name,
                overview: item['Overview'] || '',
                type: item['Type'],
                blurhash: item['ImageBlurHashes'][hashtype],
                imageType: imageType
            };
        });
    }

    async fetchAndProcessChildItems({
        parentId,
        userId,
        videoType,
        imageType,
        hashtype
    }: {
        parentId: { id: string };
        userId: string;
        videoType: string;
        imageType: string;
        hashtype: string;
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

        let processedItems: any[] = [];

        if (videoType === VideoType.boxset) {
            processedItems = childJsonData['Items']
                .filter(
                    (item: any) =>
                        item['ImageTags']?.['Primary'] ||
                        (item['BackdropImageTags'] && item['ImageBlurHashes']?.[hashtype])
                )
                .map((item: any) => ({
                    id: item['Id'],
                    name: item['Name'],
                    type: item['Type'],
                    overview: item['Overview'] || '',
                    blurhash: item['ImageBlurHashes']?.[hashtype],
                    imageType: imageType
                }));
        }

        return processedItems;
    }
}
