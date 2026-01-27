<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { serverConfig, appConfig } from '$lib/stores';
	import { JellyfinApi, ImageType, VideoType } from '$lib/jellyfinApi';
	import { applyBlurhash, getDataUrlFromBlurhash } from '$lib/blurhash';

	// Swiper
	import Swiper from 'swiper';
	import { Autoplay, EffectFade, Keyboard, Navigation } from 'swiper/modules';
	// Import Swiper styles
	import 'swiper/css';
	import 'swiper/css/effect-fade';
	import 'swiper/css/navigation';
	import 'swiper/css/autoplay';

	let swiperInstance: Swiper | null = null;
	let slides = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state('');
	let showControls = $state(false);
	let controlTimeout: any;

	// Wake Lock
	let wakeLockSentinel: WakeLockSentinel | null = null;

	onMount(() => {
		if (!$serverConfig) {
			goto('/');
			return;
		}

		const runInit = async () => {
			try {
				await initSlideshow();
				if ($appConfig.wakeLock) {
					requestWakeLock();
				}
			} catch (e: any) {
				console.error(e);
				error = e.message || 'Failed to initialize slideshow';
			} finally {
				isLoading = false;
			}
		};

		runInit();

		// Mouse movement for controls
		window.addEventListener('mousemove', handleUserActivity);
		window.addEventListener('touchstart', handleUserActivity);

		return () => {
			cleanup();
		};
	});

	async function initSlideshow() {
		const api = new JellyfinApi($serverConfig!);
		const userId = $serverConfig!.userId;
		const types = $appConfig.libraryParams;

		let allItems: any[] = [];

		// Fetch concurrently
		const promises = types.map(async (type) => {
			// Fetch Primary, Backdrop, Thumb
			const fetchTypes = [ImageType.primary, ImageType.backdrop, ImageType.thumbnail];

			const typePromises = fetchTypes.map((imgType) =>
				api
					.getVideoIds({
						videoType: type,
						imageType: imgType,
						userId
					})
					.catch((err) => {
						console.warn(`Failed to fetch ${type} ${imgType}`, err);
						return [];
					})
			);

			const results = await Promise.all(typePromises);
			return results.flat();
		});

		const results = await Promise.all(promises);
		allItems = results.flat();

		if (allItems.length === 0) {
			throw new Error('No items found with current configuration.');
		}

		// Shuffle
		for (let i = allItems.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[allItems[i], allItems[j]] = [allItems[j], allItems[i]];
		}

		slides = allItems;

		// Give DOM a moment
		setTimeout(() => {
			initSwiper();
		}, 100);
	}

	function initSwiper() {
		swiperInstance = new Swiper('.swiper', {
			modules: [Autoplay, EffectFade, Keyboard, Navigation],
			effect: 'fade',
			fadeEffect: { crossFade: true },
			speed: 1500,
			loop: true,
			autoplay: {
				delay: $appConfig.duration || 10000,
				disableOnInteraction: false,
				pauseOnMouseEnter: false
			},
			keyboard: {
				enabled: true
			},
			observer: true,
			observeParents: true
		});

		console.log('Swiper initialized');
	}

	function getImageSrc(slide: any) {
		if (!slide) return '';
		const api = new JellyfinApi($serverConfig!);
		return api.getImageUrl(slide.id, slide.imageType, $appConfig.pictureQuality || 1080);
	}

	function getBlurhashDataUrl(slide: any) {
		if (!slide.blurhash) return '';
		try {
			const hash =
				typeof slide.blurhash === 'string' ? slide.blurhash : Object.values(slide.blurhash)[0];
			return getDataUrlFromBlurhash(hash as string);
		} catch (e) {
			return '';
		}
	}

	async function requestWakeLock() {
		if ('wakeLock' in navigator) {
			try {
				wakeLockSentinel = await navigator.wakeLock.request('screen');
				console.log('Wake Lock active');
			} catch (err: any) {
				console.error(`${err.name}, ${err.message}`);
			}
		}
	}

	function handleUserActivity() {
		showControls = true;
		clearTimeout(controlTimeout);
		controlTimeout = setTimeout(() => {
			showControls = false;
		}, 3000);
	}

	function cleanup() {
		if (typeof window !== 'undefined') {
			window.removeEventListener('mousemove', handleUserActivity);
			window.removeEventListener('touchstart', handleUserActivity);
		}

		if (wakeLockSentinel) {
			wakeLockSentinel.release().catch(() => {});
			wakeLockSentinel = null;
		}

		if (swiperInstance) {
			swiperInstance.destroy();
		}
	}

	function goBack() {
		goto('/config');
	}
</script>

<div class="slideshow-container">
	{#if isLoading}
		<div class="loading-overlay">
			<div class="spinner"></div>
			<p>Loading your media...</p>
		</div>
	{:else if error}
		<div class="error-overlay">
			<p>{error}</p>
			<button class="btn btn-secondary" onclick={goBack}>Back to Config</button>
		</div>
	{:else}
		<div class="swiper">
			<div class="swiper-wrapper">
				{#each slides as slide (slide.id + slide.imageType)}
					<div class="swiper-slide">
						<div
							class="slide-bg"
							style="background-image: url('{getBlurhashDataUrl(slide)}');"
						></div>

						<img src={getImageSrc(slide)} alt={slide.name} loading="lazy" class="slide-img" />

						<div class="caption-wrapper">
							<h2 class="slide-title">{slide.name}</h2>
							{#if slide.overview}
								<p class="slide-overview">{slide.overview}</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="controls-overlay {showControls ? 'visible' : ''}">
			<div class="top-bar">
				<button class="icon-btn" onclick={goBack} title="Configure">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.68 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.48.48 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
						/>
					</svg>
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.slideshow-container {
		width: 100vw;
		height: 100vh;
		background: black;
		overflow: hidden;
		position: relative;
	}

	.swiper {
		width: 100%;
		height: 100%;
	}

	.swiper-slide {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background-color: black;
	}

	.slide-bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center;
		filter: blur(20px) brightness(0.5);
		transform: scale(1.1);
		z-index: 1;
	}

	.slide-img {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		z-index: 2;
		opacity: 0;
		transition: opacity 1s ease-in;
	}

	/* Reveal image once loaded */
	:global(.swiper-slide-active) .slide-img {
		opacity: 1;
	}

	.caption-wrapper {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		padding: 4rem 2rem 2rem;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
		z-index: 3;
		color: white;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
		opacity: 0;
		transform: translateY(20px);
		transition: all 0.5s ease-out 0.5s;
	}

	:global(.swiper-slide-active) .caption-wrapper {
		opacity: 1;
		transform: translateY(0);
	}

	.slide-title {
		font-size: 2.5rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.slide-overview {
		font-size: 1.1rem;
		max-width: 800px;
		line-height: 1.5;
		opacity: 0.9;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.loading-overlay,
	.error-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		color: white;
		z-index: 100;
		background: #000;
		gap: 1rem;
	}

	.spinner {
		width: 50px;
		height: 50px;
		border: 4px solid rgba(255, 255, 255, 0.3);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: spin 1s infinite linear;
	}

	.controls-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 10;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.controls-overlay.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.top-bar {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		gap: 1rem;
	}

	.icon-btn {
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s;
		backdrop-filter: blur(5px);
	}

	.icon-btn:hover {
		background: var(--primary);
		border-color: var(--primary);
		transform: scale(1.05);
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
</style>
