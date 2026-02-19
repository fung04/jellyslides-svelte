<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { serverConfig, appConfig } from '$lib/stores';
	import { JellyfinApi, VideoType } from '$lib/jellyfinApi';
	import { getDataUrlFromBlurhash } from '$lib/blurhash';
	import { slideshowState } from '$lib/slideshow-state.svelte';
	import { initWebSocket, disconnectWebSocket } from '$lib/ws-handler';
	// Swiper
	import Swiper from 'swiper';
	import { Autoplay, EffectFade, Keyboard, Navigation } from 'swiper/modules';
	// Import Swiper styles
	import 'swiper/css';
	import 'swiper/css/effect-fade';
	import 'swiper/css/navigation';
	import 'swiper/css/autoplay';

	// ── Constants ──────────────────────────────────────────────
	const PRELOAD_COUNT = 3;
	const CACHE_SIZE = 10;
	const VIRTUAL_SLIDE_COUNT = 3; // 3 physical slides in DOM (minimum for Swiper loop)

	// ── Reactive state ────────────────────────────────────────
	let swiperInstance: Swiper | null = null;
	let allItems: any[] = []; // Full media list from Jellyfin
	let virtualSlides = $state<any[]>([]); // Only 2 items rendered in DOM
	let isLoading = $state(true);
	let error = $state('');
	let showControls = $state(false);
	let controlTimeout: any;

	// ── Virtual-slide management ──────────────────────────────
	let currentIndex = 0; // Points to the next item to load from allItems
	let slideCache = new Map<
		string,
		{ url: string; blurhash: string; name: string; overview: string }
	>();
	let viewedSlides = new Set<string>();
	let preloadAbortController: AbortController | null = null;

	// Wake Lock
	let wakeLockSentinel: WakeLockSentinel | null = null;
	let api: JellyfinApi | null = null;

	// Helper to determine layout class
	function getLayoutType(slide: any) {
		if (slide.type === 'Audio') return 'is-audio';
		if (slide.imageType === 'Primary') return 'is-portrait';
		return 'is-landscape';
	}

	// ── requestIdleCallback polyfill for RPi ──────────────────
	function idleCallback(fn: () => void) {
		if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
			(window as any).requestIdleCallback(fn);
		} else {
			setTimeout(fn, 1);
		}
	}

	// ── Lifecycle ─────────────────────────────────────────────
	onMount(() => {
		if (!$serverConfig) {
			goto('/');
			return;
		}

		api = new JellyfinApi($serverConfig!);

		const runInit = async () => {
			try {
				await initSlideshow();
				if ($appConfig.wakeLock) {
					requestWakeLock();
				}
				if ($appConfig.websocket) {
					initWebSocket($serverConfig!);
				}
			} catch (e: any) {
				console.error(e);
				error = e.message || 'Failed to initialize slideshow';
			} finally {
				isLoading = false;
			}
		};

		runInit();

		// Mouse/touch for controls overlay
		window.addEventListener('mousemove', handleUserActivity);
		window.addEventListener('touchstart', handleUserActivity);

		return () => {
			cleanup();
		};
	});

	// ── Data loading ──────────────────────────────────────────
	async function initSlideshow() {
		const userId = $serverConfig!.userId;
		const types = $appConfig.libraryParams;

		let fetchedItems: any[] = [];

		// Fetch concurrently — one call per video type (image types auto-detected)
		const promises = types.map(async (type) => {
			return api!.getVideoIds({ videoType: type, userId }).catch((err) => {
				console.warn(`Failed to fetch ${type}`, err);
				return [];
			});
		});

		const results = await Promise.all(promises);
		fetchedItems = results.flat();

		if (fetchedItems.length === 0) {
			throw new Error('No items found with current configuration.');
		}

		// Shuffle (Fisher-Yates)
		for (let i = fetchedItems.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[fetchedItems[i], fetchedItems[j]] = [fetchedItems[j], fetchedItems[i]];
		}

		allItems = fetchedItems;

		// Seed the 3 virtual slides (Swiper loop requires ≥3)
		virtualSlides = [allItems[0], allItems[1 % allItems.length], allItems[2 % allItems.length]];
		currentIndex = 3 % allItems.length;

		// Mark as viewed
		viewedSlides.add(allItems[0].id);
		if (allItems.length > 1) viewedSlides.add(allItems[1].id);
		if (allItems.length > 2) viewedSlides.add(allItems[2].id);

		// Let the DOM render the swiper container first
		isLoading = false;
		// Wait for Svelte to flush DOM, then a frame for layout
		await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
		initSwiper();

		// Preload the next few images in the background
		idleCallback(() => {
			preloadImages(currentIndex, PRELOAD_COUNT);
		});
	}

	// ── Swiper initialization ─────────────────────────────────
	function initSwiper() {
		swiperInstance = new Swiper('.swiper', {
			modules: [Autoplay, EffectFade, Keyboard, Navigation],
			effect: 'fade',
			fadeEffect: { crossFade: true },
			speed: 1500,
			rewind: true,
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

		// ── On every transition end: swap the offscreen slide's content ──
		swiperInstance.on('slideChangeTransitionEnd', () => {
			if (!allItems || allItems.length === 0) return;
			if (!swiperInstance) return;

			swiperInstance.autoplay.pause();

			// Wrap around
			if (currentIndex >= allItems.length) {
				currentIndex = 0;
			}

			const activeIdx = swiperInstance.activeIndex;

			// Determine which slot(s) to update with fresh content
			// We update the slots that are NOT currently active
			const slotsToUpdate: number[] = [];
			for (let s = 0; s < VIRTUAL_SLIDE_COUNT; s++) {
				if (s !== activeIdx) slotsToUpdate.push(s);
			}

			for (const slot of slotsToUpdate) {
				// Pick next unseen item
				let videoToShow = allItems[currentIndex];
				let attempts = 0;

				while (viewedSlides.has(videoToShow.id) && attempts < allItems.length) {
					currentIndex = (currentIndex + 1) % allItems.length;
					videoToShow = allItems[currentIndex];
					attempts++;
				}

				// If everything has been viewed, reset and show all again
				if (attempts >= allItems.length) {
					viewedSlides.clear();
				}

				// Update the virtual slide data (triggers Svelte reactivity)
				virtualSlides[slot] = videoToShow;

				// Track viewed
				viewedSlides.add(videoToShow.id);

				// Advance pointer
				currentIndex = (currentIndex + 1) % allItems.length;
			}

			// Manage cache size
			if (slideCache.size > CACHE_SIZE) {
				const oldestKey = slideCache.keys().next().value;
				if (oldestKey) slideCache.delete(oldestKey);
			}

			// Preload next batch in idle time
			const nextPreloadIndex = currentIndex;
			idleCallback(() => {
				preloadImages(nextPreloadIndex, PRELOAD_COUNT);
			});

			// Resume autoplay
			swiperInstance.autoplay.resume();
		});

		// Resize handler
		swiperInstance.on('resize', () => {
			if (slideshowState.isRemoteControlling) return;
			swiperInstance!.update();
			if (swiperInstance!.autoplay.paused) {
				swiperInstance!.autoplay.resume();
			}
		});

		// Start autoplay explicitly (constructor config sets it up, but we ensure it's running)
		swiperInstance.autoplay.start();
		console.log(`Swiper initialized – ${allItems.length} items, ${VIRTUAL_SLIDE_COUNT} DOM slides`);
	}

	// ── Image helpers ─────────────────────────────────────────
	function getImageSrc(slide: any) {
		if (!slide || !api) return '';
		const quality = $appConfig.pictureQuality || 100;
		// Use 720p on RPi to save bandwidth & memory
		const resolution = $appConfig.pictureResolution || 720;
		return api.getImageUrl(slide.id, slide.imageType, quality, resolution);
	}

	function getBlurhashDataUrl(slide: any) {
		if (!slide?.blurhash) return '';
		try {
			const hash =
				typeof slide.blurhash === 'string' ? slide.blurhash : Object.values(slide.blurhash)[0];
			return getDataUrlFromBlurhash(hash as string);
		} catch (e) {
			return '';
		}
	}

	// ── Image preloading ──────────────────────────────────────
	async function preloadImages(startIndex: number, count: number) {
		// Abort any previous preload batch
		if (preloadAbortController) {
			preloadAbortController.abort();
		}
		preloadAbortController = new AbortController();
		const signal = preloadAbortController.signal;

		try {
			const promises: Promise<void>[] = [];
			for (let i = 0; i < count; i++) {
				if (signal.aborted) break;
				const index = (startIndex + i) % allItems.length;
				const item = allItems[index];
				if (!item || slideCache.has(item.id)) continue;

				const url = getImageSrc(item);
				if (!url) continue;

				const promise = new Promise<void>((resolve, reject) => {
					const img = new Image();
					img.onload = () => {
						slideCache.set(item.id, {
							url,
							blurhash:
								typeof item.blurhash === 'string'
									? item.blurhash
									: (Object.values(item.blurhash)[0] as string),
							name: item.name,
							overview: item.overview || ''
						});
						resolve();
					};
					img.onerror = () => reject(new Error(`Failed to preload ${item.id}`));
					img.src = url;
				});
				promises.push(promise);
			}
			await Promise.allSettled(promises);
		} catch (err) {
			if (!signal.aborted) {
				console.warn('Preload error:', err);
			}
		}
	}

	// ── Keyboard ──────────────────────────────────────────────
	function handleKeydown(e: KeyboardEvent) {
		if (!swiperInstance) return;
		if (e.key === 'ArrowRight') {
			swiperInstance.slideNext();
			swiperInstance.autoplay.start();
			slideshowState.isRemoteControlling = false;
		}
		if (e.key === 'ArrowLeft') {
			swiperInstance.slidePrev();
		}
		if (e.key === 'p') {
			if (swiperInstance.autoplay.running) {
				swiperInstance.autoplay.stop();
			} else {
				swiperInstance.autoplay.start();
			}
		}
	}

	// ── WebSocket Remote Control ──────────────────────────────
	$effect(() => {
		if (slideshowState.isRemoteControlling && slideshowState.activeSlide) {
			const newItem = slideshowState.activeSlide;
			console.log('Remote control → slide:', newItem.name);

			if (swiperInstance) {
				swiperInstance.autoplay.stop();

				// Place the remote item in the NEXT virtual slot
				const activeIndex = swiperInstance.realIndex;
				const nextSlotIndex = (activeIndex + 1) % VIRTUAL_SLIDE_COUNT;

				// Overwrite virtual slide data
				virtualSlides[nextSlotIndex] = newItem;

				// Let Svelte update the DOM, then slide to it
				setTimeout(() => {
					swiperInstance?.slideNext();
				}, 50);
			}
		} else if (
			!slideshowState.isRemoteControlling &&
			swiperInstance &&
			!swiperInstance.autoplay.running
		) {
			// Remote control released → resume autoplay
			swiperInstance.autoplay.start();
		}
	});

	// ── Wake Lock ─────────────────────────────────────────────
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

	// ── Controls overlay ──────────────────────────────────────
	function handleUserActivity() {
		showControls = true;
		clearTimeout(controlTimeout);
		controlTimeout = setTimeout(() => {
			showControls = false;
		}, 3000);
	}

	// ── Cleanup ───────────────────────────────────────────────
	function cleanup() {
		if (typeof window !== 'undefined') {
			window.removeEventListener('mousemove', handleUserActivity);
			window.removeEventListener('touchstart', handleUserActivity);
		}

		// Abort pending preloads
		if (preloadAbortController) {
			preloadAbortController.abort();
			preloadAbortController = null;
		}

		// Release wake lock
		if (wakeLockSentinel) {
			wakeLockSentinel.release().catch(() => {});
			wakeLockSentinel = null;
		}

		// Destroy Swiper
		if (swiperInstance) {
			swiperInstance.autoplay.stop();
			swiperInstance.destroy(true, true);
			swiperInstance = null;
		}

		// Disconnect WebSocket
		disconnectWebSocket();

		// Clear caches to free memory
		slideCache.clear();
		viewedSlides.clear();

		// Null out the big array
		allItems = [];
		virtualSlides = [];
	}

	function goBack() {
		goto('/config');
	}
</script>

<svelte:window onkeydown={handleKeydown} />

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
		<div class="swiper swiper-container">
			<div class="swiper-wrapper">
				<!-- Only 2 slides in the DOM at any time -->
				{#each virtualSlides as slide, i (i)}
					{@const layoutClass = getLayoutType(slide)}
					<div class="swiper-slide {layoutClass}">
						<!-- Blurhash background -->
						<div
							class="slide-bg"
							style="background-image: url('{getBlurhashDataUrl(slide)}');"
						></div>
						{#if layoutClass === 'is-audio'}
							<div class="audio-card">
								<img class="slide-img" src={getImageSrc(slide)} alt={slide.name} loading="lazy" />
								<div class="caption-wrapper">
									<h2 class="swiper-slide-caption">{slide.name}</h2>
									<p class="swiper-slide-overview">{slide.overview}</p>
								</div>
							</div>
						{:else if layoutClass === 'is-portrait'}
							<div class="portrait-card">
								<img class="slide-img" src={getImageSrc(slide)} alt={slide.name} loading="lazy" />
								<div class="caption-wrapper">
									<h2 class="swiper-slide-caption">{slide.name}</h2>
									<p class="swiper-slide-overview">{slide.overview}</p>
								</div>
							</div>
						{:else}
							<!-- Landscape -->
							<img class="slide-img" src={getImageSrc(slide)} alt={slide.name} loading="lazy" />
							<div class="caption-wrapper">
								<h2 class="swiper-slide-caption">{slide.name}</h2>
								<p class="swiper-slide-overview">{slide.overview}</p>
							</div>
						{/if}
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
	/* ===== SLIDESHOW CONTAINER ===== */
	.slideshow-container {
		width: 100vw;
		height: 100vh;
		background: #000;
		overflow: hidden;
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.swiper-wrapper {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
	}
	/* ===== SWIPER BASE ===== */
	.swiper {
		width: 100%;
		height: 100%;
	}
	.swiper-slide {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background-color: #000;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	/* ===== BLURRED BACKGROUND (ALL LAYOUTS) ===== */
	.slide-bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center;
		filter: blur(30px) brightness(0.4);
		transform: scale(1.1);
		z-index: 1;
	}
	/* ===== DEFAULT IMAGE STYLING ===== */
	.slide-img {
		opacity: 0;
		transition: opacity 1s ease-in;
	}
	/* Reveal image once loaded */
	:global(.swiper-slide-active) .slide-img {
		opacity: 1;
	}
	/* ===== LAYOUT 1: AUDIO (TOP-BOTTOM) ===== */
	.swiper-slide.is-audio {
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 2rem;
	}
	.audio-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		max-width: 90%;
		max-height: 90%;
		gap: 2rem;
		z-index: 2;
	}
	.swiper-slide .audio-card .slide-img {
		width: auto;
		height: auto;
		max-width: 600px;
		max-height: 60vh;
		object-fit: contain;
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
	}
	.swiper-slide .audio-card .caption-wrapper {
		position: static;
		background: rgba(0, 0, 0, 0.7);
		padding: 1.5rem 2rem;
		border-radius: 12px;
		backdrop-filter: blur(10px);
		text-align: center;
		max-width: 600px;
		width: 100%;
		opacity: 0;
		transform: translateY(20px);
		transition: all 0.5s ease-out 0.5s;
	}
	:global(.swiper-slide-active) .audio-card .caption-wrapper {
		opacity: 1;
		transform: translateY(0);
	}
	.swiper-slide .audio-card .swiper-slide-caption {
		color: #fff;
		font-size: 2rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
	}
	.swiper-slide .audio-card .swiper-slide-overview {
		color: #e0e0e0;
		font-size: 1rem;
		line-height: 1.6;
		opacity: 0.9;
	}
	/* ===== LAYOUT 2: PORTRAIT (LEFT-RIGHT) ===== */
	.swiper-slide.is-portrait {
		flex-direction: row;
		justify-content: center;
		align-items: center;
		padding: 2rem;
	}
	.portrait-card {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		justify-content: center;
		max-width: 90%;
		max-height: 85vh;
		background: rgba(0, 0, 0, 0.8);
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 25px 80px rgba(0, 0, 0, 0.7);
		z-index: 2;
	}
	.portrait-card .slide-img {
		flex: 0 0 45%;
		width: 45%;
		height: 100%;
		object-fit: cover;
		object-position: center;
	}
	.portrait-card .caption-wrapper {
		position: static;
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		padding: 2.5rem;
		background: transparent;
		opacity: 0;
		transform: translateX(30px);
		transition: all 0.6s ease-out 0.5s;
	}
	:global(.swiper-slide-active) .portrait-card .caption-wrapper {
		opacity: 1;
		transform: translateX(0);
	}
	.portrait-card .swiper-slide-caption {
		color: #fff;
		font-size: 2.5rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
		line-height: 1.2;
	}
	.portrait-card .swiper-slide-overview {
		color: #e0e0e0;
		font-size: 1.1rem;
		line-height: 1.7;
		opacity: 0.95;
		overflow-y: auto;
		padding-right: 1rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
	}
	.portrait-card .swiper-slide-overview::-webkit-scrollbar {
		width: 6px;
	}
	.portrait-card .swiper-slide-overview::-webkit-scrollbar-track {
		background: transparent;
	}
	.portrait-card .swiper-slide-overview::-webkit-scrollbar-thumb {
		background-color: rgba(255, 255, 255, 0.3);
		border-radius: 10px;
	}
	/* ===== LAYOUT 3: LANDSCAPE (FULLSCREEN BACKGROUND) ===== */
	.swiper-slide.is-landscape {
		flex-direction: column;
		justify-content: flex-end;
		align-items: flex-start;
	}
	.swiper-slide.is-landscape .slide-img {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 2;
	}
	.swiper-slide .caption-wrapper {
		position: relative;
		width: 100%;
		max-width: 900px;
		padding: 3rem;
		background: linear-gradient(
			to top,
			rgba(0, 0, 0, 0.95) 0%,
			rgba(0, 0, 0, 0.85) 40%,
			rgba(0, 0, 0, 0.5) 70%,
			transparent 100%
		);
		z-index: 3;
		opacity: 0;
		transform: translateY(30px);
		transition: all 0.6s ease-out 0.5s;
	}
	:global(.swiper-slide-active) .caption-wrapper {
		opacity: 1;
		transform: translateY(0);
	}
	.swiper-slide .caption-wrapper {
		color: #fff;
		font-size: 3rem;
		font-weight: 700;
		text-shadow: 0 4px 12px rgba(0, 0, 0, 0.7);
		line-height: 1.1;
	}
	.swiper-slide .swiper-slide-overview {
		color: #e0e0e0;
		font-size: 1.2rem;
		line-height: 1.6;
		opacity: 0.95;
		max-width: 800px;
		text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
		display: -webkit-box;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	/* ===== CONTROLS & OVERLAYS ===== */
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
		border-top-color: #007aff;
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
		top: 1.5rem;
		right: 1.5rem;
		display: flex;
		gap: 1rem;
	}
	.icon-btn {
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.3s ease;
		backdrop-filter: blur(10px);
	}
	.icon-btn svg {
		width: 24px;
		height: 24px;
	}
	.icon-btn:hover {
		background: #007aff;
		border-color: #007aff;
		transform: scale(1.1);
	}
	.icon-btn:active {
		transform: scale(0.95);
	}
	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
	/* ===== RESPONSIVE BREAKPOINTS ===== */
	/* Mobile Phones (Portrait) */
	@media (max-width: 767px) {
		/* Audio Layout */
		.audio-card {
			gap: 1.5rem;
		}
		.audio-card .slide-img {
			max-width: 85%;
			max-height: 50vh;
		}
		.audio-card .caption-wrapper {
			padding: 1.25rem 1.5rem;
		}
		.audio-card .swiper-slide-caption {
			font-size: 1.5rem;
		}
		.audio-card .swiper-slide-overview {
			font-size: 0.9rem;
		}
		/* Portrait Layout - Stack vertically on mobile */
		.portrait-card {
			flex-direction: column;
			max-height: 90vh;
			max-width: 95%;
		}
		.portrait-card .slide-img {
			flex: 0 0 50%;
			width: 100%;
			height: 50%;
		}
		.portrait-card .caption-wrapper {
			padding: 1.5rem;
			overflow-y: auto;
		}
		.portrait-card .swiper-slide-caption {
			font-size: 1.8rem;
			margin-bottom: 1rem;
		}
		.portrait-card .swiper-slide-overview {
			font-size: 0.95rem;
			line-height: 1.5;
		}
		/* Landscape Layout */
		.swiper-slide.is-landscape .caption-wrapper {
			padding: 2rem 1.5rem;
		}
		.swiper-slide.is-landscape .swiper-slide-caption {
			font-size: 2rem;
		}
		.swiper-slide.is-landscape .swiper-slide-overview {
			font-size: 1rem;
			-webkit-line-clamp: 3;
		}
		.top-bar {
			top: 1rem;
			right: 1rem;
		}
		.icon-btn {
			width: 44px;
			height: 44px;
		}
		.icon-btn svg {
			width: 20px;
			height: 20px;
		}
	}
	/* Tablets (Portrait) */
	@media (min-width: 768px) and (max-width: 1023px) and (orientation: portrait) {
		.portrait-card {
			flex-direction: column;
			max-height: 88vh;
		}
		.portrait-card .slide-img {
			flex: 0 0 55%;
			width: 100%;
			height: 55%;
		}
		.portrait-card .caption-wrapper {
			padding: 2rem;
		}
		.portrait-card .swiper-slide-caption {
			font-size: 2.2rem;
		}
		.portrait-card .swiper-slide-overview {
			font-size: 1.05rem;
		}
		.swiper-slide.is-landscape .swiper-slide-caption {
			font-size: 2.5rem;
		}
		.swiper-slide.is-landscape .swiper-slide-overview {
			font-size: 1.15rem;
		}
	}
	/* Tablets (Landscape) */
	@media (min-width: 768px) and (max-width: 1023px) and (orientation: landscape) {
		.portrait-card {
			flex-direction: row;
			max-height: 80vh;
		}
		.portrait-card .slide-img {
			flex: 0 0 42%;
			width: 42%;
		}
		.portrait-card .swiper-slide-caption {
			font-size: 2rem;
		}
		.portrait-card .swiper-slide-overview {
			font-size: 1rem;
		}
		.swiper-slide.is-landscape .swiper-slide-caption {
			font-size: 2.8rem;
		}
	}
	/* Large Desktops */
	@media (min-width: 1920px) {
		.audio-card .slide-img {
			max-width: 700px;
			max-height: 65vh;
		}
		.audio-card .swiper-slide-caption {
			font-size: 2.5rem;
		}
		.audio-card .swiper-slide-overview {
			font-size: 1.15rem;
		}
		.portrait-card .swiper-slide-caption {
			font-size: 3rem;
		}
		.portrait-card .swiper-slide-overview {
			font-size: 1.25rem;
		}
		.swiper-slide.is-landscape .swiper-slide-caption {
			font-size: 3.5rem;
		}
		.swiper-slide.is-landscape .swiper-slide-overview {
			font-size: 1.4rem;
			-webkit-line-clamp: 5;
		}
	}
</style>
