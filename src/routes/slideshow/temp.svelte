<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { serverConfig, appConfig } from '$lib/stores';
	import { slideshowState } from '$lib/slideshow-state.svelte';
	import { initWebSocket, disconnectWebSocket } from '$lib/ws-handler';
	import { JellyfinApi, ImageType } from '$lib/jellyfinApi';
	import { getDataUrlFromBlurhash } from '$lib/blurhash';
	import Clock from '$lib/components/Clock.svelte';

	// Swiper
	import Swiper from 'swiper';
	import { Autoplay, EffectFade, Keyboard, Navigation } from 'swiper/modules';
	import 'swiper/css';
	import 'swiper/css/effect-fade';
	import 'swiper/css/navigation';
	import 'swiper/css/autoplay';

	import './styles.css'; // Import the porting CSS

	let swiperInstance: Swiper | null = null;
	let slides = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state('');

	// Wake Lock
	let wakeLockSentinel: WakeLockSentinel | null = null;

	// Helper to determine layout class
	function getLayoutType(slide: any) {
		if (slide.type === 'Audio') return 'is-audio';
		if (slide.imageType === 'Primary') return 'is-portrait';
		return 'is-landscape';
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

	function getImageSrc(slide: any) {
		if (slide.imageUrl) return slide.imageUrl;
		if (!slide.id) return '';
		const api = new JellyfinApi($serverConfig!);
		return api.getImageUrl(slide.id, slide.imageType, $appConfig.pictureQuality || 1080);
	}

	onMount(() => {
		if (!$serverConfig) {
			goto(`${base}/`);
			return;
		}

		// Init WebSocket
		if ($appConfig.websocket) {
			initWebSocket($serverConfig);
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
			const fetchTypes = [ImageType.primary, ImageType.backdrop];
			const typePromises = fetchTypes.map((imgType) =>
				api.getVideoIds({ videoType: type, imageType: imgType, userId }).catch((err) => [])
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

		// Wait for DOM
		setTimeout(() => initSwiper(), 100);
	}

	function initSwiper() {
		if (swiperInstance) swiperInstance.destroy();

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
			keyboard: { enabled: true },
			observer: true,
			observeParents: true,
			allowTouchMove: false
		});
	}

	// --- Reactivity for Remote Control ---
	$effect(() => {
		if (slideshowState.isRemoteControlling && slideshowState.activeSlide) {
			const newItem = slideshowState.activeSlide;
			console.log('Switching to Remote Slide:', newItem.name);

			if (swiperInstance) {
				swiperInstance.autoplay.stop();

				// Strategy: Find current index, replace NEXT slide with new item, slide to it.
				// Or simplier for Svelte: Update `slides` array?
				// Updating `slides` array causes re-render of list.

				// Let's try to just prepend the new item and slide to 0.
				// Note: `slides` is reactive state.
				// slides = [newItem, ...slides];
				// The above might cause full DOM refresh.

				// Alternative: Just set slides to [newItem] if we want to lock it?
				// But we want transitions.

				// Let's replace the "active" slide in the array *after* the current one.
				const activeIndex = swiperInstance.realIndex;
				const nextIndex = (activeIndex + 1) % slides.length;

				// Update the data in the array
				slides[nextIndex] = newItem;

				// Trigger Swiper update (it observes DOM)
				setTimeout(() => {
					swiperInstance?.slideToLoop(nextIndex);
				}, 50);
			}
		} else if (
			!slideshowState.isRemoteControlling &&
			swiperInstance &&
			!swiperInstance.autoplay.running
		) {
			// Resume Autoplay
			swiperInstance.autoplay.start();
		}
	});

	async function requestWakeLock() {
		if ('wakeLock' in navigator) {
			try {
				wakeLockSentinel = await navigator.wakeLock.request('screen');
			} catch (err: any) {
				console.error(`${err.name}, ${err.message}`);
			}
		}
	}

	function cleanup() {
		if (wakeLockSentinel) wakeLockSentinel.release().catch(() => {});
		if (swiperInstance) swiperInstance.destroy();
		disconnectWebSocket();
	}

	function handleLogout() {
		slideshowState.isWebSocketConnected = false;
		goto(`${base}/`);
	}

	function goBack() {
		goto(`${base}/config`);
	}

	let showControls = $derived(slideshowState.showInfoPanel);
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
			<button class="btn btn-secondary" onclick={() => goto(`${base}/config`)}
				>Back to Config</button
			>
		</div>
	{:else}
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

		<!-- Info Layer -->
		{#if slideshowState.showInfoPanel}
			<Clock onclick={() => slideshowState.toggleInfoPanel()} />

			<div class="info-wrapper">
				<div class="info-placeholder">
					<!-- Optional left side content -->
				</div>
				<div class="options-menu-container">
					<button
						class="more-options-button"
						onclick={(e) => {
							e.stopPropagation();
							slideshowState.toggleOptionsMenu();
						}}
						title="More options"
					>
						⋮
					</button>
					{#if slideshowState.showOptionsMenu}
						<div class="options-dropdown">
							<button class="dropdown-button" onclick={handleLogout}>Logout</button>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div id="top-right-clock" onclick={() => slideshowState.toggleInfoPanel()}>
				<!-- Simple clock trigger area -->
				Show Info
			</div>
		{/if}

		<div class="swiper swiper-container">
			<div class="swiper-wrapper">
				{#each slides as slide, i (slide.id + i)}
					<!-- Determine Layout Class -->
					{@const layoutClass = getLayoutType(slide)}

					<div class="swiper-slide {layoutClass}">
						<!-- Background (Applied to all) -->
						<div
							class="slide-bg"
							style="background-image: url('{getBlurhashDataUrl(slide)}');"
						></div>

						{#if layoutClass === 'is-audio'}
							<div class="audio-card">
								<img src={getImageSrc(slide)} alt={slide.name} loading="lazy" />
								<div class="caption-wrapper">
									<h2 class="swiper-slide-caption">{slide.name}</h2>
									<p class="swiper-slide-overview">{slide.overview}</p>
								</div>
							</div>
						{:else if layoutClass === 'is-portrait'}
							<div class="portrait-card">
								<img src={getImageSrc(slide)} alt={slide.name} loading="lazy" />
								<div class="caption-wrapper">
									<h2 class="swiper-slide-caption">{slide.name}</h2>
									<p class="swiper-slide-overview">{slide.overview}</p>
								</div>
							</div>
						{:else}
							<!-- Landscape -->
							<img src={getImageSrc(slide)} alt={slide.name} loading="lazy" />
							<div class="caption-wrapper">
								<h2 class="swiper-slide-caption">{slide.name}</h2>
								<p class="swiper-slide-overview">{slide.overview}</p>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Scoped styles that override or augment the imported CSS if needed */
	.slideshow-container {
		position: relative;
		width: 100vw;
		height: 100vh;
		background: black;
	}

	.info-wrapper {
		position: absolute;
		bottom: 0px;
		left: 0;
		z-index: 50;
	}

	.slide-bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center;
		filter: blur(50px) brightness(0.4);
		transform: scale(1.2);
		z-index: -1;
	}

	/* Loading/Error States */
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
		z-index: 1000;
		background: #000;
		gap: 1rem;
	}

	.spinner {
		width: 50px;
		height: 50px;
		border: 4px solid rgba(255, 255, 255, 0.3);
		border-top-color: var(--primary, #fff);
		border-radius: 50%;
		animation: spin 1s infinite linear;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.btn {
		padding: 0.5rem 1rem;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		border: none;
		transition: background 0.2s;
	}

	.btn-secondary {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.btn-secondary:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.controls-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 60;
		opacity: 0;
		transition: opacity 0.3s ease-in-out;
	}

	.controls-overlay.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.top-bar {
		position: absolute;
		top: 20px;
		left: 20px;
		display: flex;
		gap: 10px;
		z-index: 61;
	}

	.icon-btn {
		background: rgba(0, 0, 0, 0.5);
		border: none;
		border-radius: 50%;
		width: 44px;
		height: 44px;
		display: flex;
		justify-content: center;
		align-items: center;
		cursor: pointer;
		color: white;
		transition: all 0.2s ease;
		backdrop-filter: blur(4px);
	}

	.icon-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	.icon-btn svg {
		width: 24px;
		height: 24px;
	}
</style>
