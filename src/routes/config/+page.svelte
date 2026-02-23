<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { serverConfig, appConfig } from '$lib/stores';
	import { onMount } from 'svelte';

	let resolution = $state(1080);
	let duration = $state(30);
	let wakeLock = $state(false);
	let websocket = $state(false);
	let selectedTypes = $state(['Movie', 'Series']);
	let quality = $state(100);

	// Available options
	const resolutionOptions = [
		{ label: 'High (1080p)', value: 1080 },
		{ label: 'Medium (720p)', value: 720 },
		{ label: 'Low (480p)', value: 480 }
	];

	const typeOptions = [
		{ label: 'Movies', value: 'Movie' },
		{ label: 'TV Series', value: 'Series' },
		{ label: 'Collections', value: 'BoxSet' },
		{ label: 'Music', value: 'Audio' }
	];

	onMount(() => {
		if (!$serverConfig) {
			goto(resolve('/'));
			return;
		}

		// Load existing config
		resolution = $appConfig.pictureResolution;
		quality = $appConfig.pictureQuality;
		duration = $appConfig.duration / 1000;
		wakeLock = $appConfig.wakeLock;
		websocket = $appConfig.websocket;
		selectedTypes = [...$appConfig.libraryParams];
	});

	function toggleType(type: string) {
		if (selectedTypes.includes(type)) {
			selectedTypes = selectedTypes.filter((t) => t !== type);
		} else {
			selectedTypes = [...selectedTypes, type];
		}
	}

	function handleSave() {
		appConfig.set({
			...$appConfig,
			pictureResolution: resolution,
			pictureQuality: quality,
			libraryParams: selectedTypes,
			duration: duration * 1000,
			wakeLock,
			websocket
		});

		goto(resolve('/slideshow'));
	}

	function handleLogout() {
		serverConfig.set(null);
		goto(resolve('/'));
	}
</script>

<div class="page-container">
	<div class="config-card">
		<header>
			<div class="header-content">
				<h2>Slideshow Settings</h2>
				<p>Customize your viewing experience</p>
			</div>
		</header>

		<div class="config-sections">
			<!-- Picture resolution -->
			<section class="section-card">
				<div class="section-header">
					<h3>Resolution</h3>
				</div>
				<div class="resolution-grid">
					{#each resolutionOptions as opt}
						<button
							class="option-btn {resolution === opt.value ? 'active' : ''}"
							onclick={() => (resolution = opt.value)}
						>
							<span class="option-label">{opt.label}</span>
						</button>
					{/each}
				</div>
			</section>

			<!-- Picture quality -->
			<section class="section-card">
				<div class="section-header">
					<h3>Quality</h3>
					<span class="value-badge">{quality}%</span>
				</div>
				<div class="slider-container">
					<input type="range" class="slider" min="5" max="100" bind:value={quality} />
					<div class="slider-labels">
						<span>Low</span>
						<span>High</span>
					</div>
				</div>
			</section>

			<!-- Library Content -->
			<section class="section-card">
				<div class="section-header">
					<h3>Content Types</h3>
				</div>
				<div class="checkbox-grid">
					{#each typeOptions as type}
						<button
							class="checkbox-btn {selectedTypes.includes(type.value) ? 'active' : ''}"
							onclick={() => toggleType(type.value)}
						>
							<span class="check-icon">
								{#if selectedTypes.includes(type.value)}
									<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
										<path
											d="M13.5 4L6 11.5L2.5 8"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								{/if}
							</span>
							<span>{type.label}</span>
						</button>
					{/each}
				</div>
			</section>

			<!-- Slideshow Settings -->
			<section class="section-card">
				<div class="section-header">
					<h3>Slideshow Duration</h3>
				</div>
				<div class="duration-input">
					<input type="number" id="duration" min="5" bind:value={duration} />
					<span class="input-suffix">seconds</span>
				</div>
			</section>

			<!-- Toggles -->
			<section class="section-card">
				<div class="section-header">
					<h3>Advanced</h3>
				</div>
				<div class="toggles">
					<label class="toggle-row">
						<div class="toggle-info">
							<span class="toggle-title">Keep Screen Awake</span>
							<span class="toggle-desc">Prevent device from sleeping</span>
						</div>
						<input type="checkbox" bind:checked={wakeLock} />
						<span class="toggle-switch"></span>
					</label>

					<label class="toggle-row">
						<div class="toggle-info">
							<span class="toggle-title">Remote Control</span>
							<span class="toggle-desc">Enable WebSocket connection</span>
						</div>
						<input type="checkbox" bind:checked={websocket} />
						<span class="toggle-switch"></span>
					</label>
				</div>
			</section>
		</div>

		<div class="actions">
			<button class="btn btn-secondary" onclick={handleLogout}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<path
						d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6M10.6667 11.3333L14 8M14 8L10.6667 4.66667M14 8H6"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				Logout
			</button>
			<button class="btn btn-primary" onclick={handleSave}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
					<path
						d="M8 2L3 6L8 10L13 6L8 2Z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M3 10L8 14L13 10"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				Start Slideshow
			</button>
		</div>
	</div>
</div>

<style>
	.page-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background: var(--bg-dark);
		padding: var(--spacing-3xl);
	}

	.config-card {
		width: 100%;
		max-width: 600px;
		background: var(--card-bg);
		backdrop-filter: blur(20px);
		border-radius: var(--radius-xl);
		border: 1px solid var(--card-border);
		overflow: hidden;
		box-shadow:
			var(--shadow-lg),
			0 0 0 1px rgba(255, 255, 255, 0.05) inset;
	}

	header {
		padding: var(--spacing-3xl) var(--spacing-3xl) var(--spacing-2xl);
		background: var(--gradient-purple-light);
		border-bottom: 1px solid var(--border-light);
	}

	.header-content h2 {
		margin: 0 0 var(--spacing-sm);
		font-size: var(--text-2xl);
		font-weight: 700;
		background: var(--gradient-text);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		letter-spacing: -0.02em;
	}

	.header-content p {
		margin: 0;
		color: var(--text-label);
		font-size: var(--text-md);
	}

	.config-sections {
		padding: var(--spacing-2xl);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xl);
	}

	.section-card {
		background: var(--section-bg);
		border: 1px solid var(--section-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-2xl);
		transition: all var(--transition-smooth);
	}

	.section-card:hover {
		background: var(--section-bg-hover);
		border-color: var(--section-border-hover);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-lg);
	}

	.section-header h3 {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-tertiary);
	}

	.value-badge {
		padding: 0.375rem var(--spacing-md);
		font-size: var(--text-sm);
		background: var(--background);
		color: white;
		font-weight: 700;
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-glow);
	}

	.resolution-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--spacing-md);
	}

	.option-btn {
		background: var(--input-bg);
		border: 1.5px solid var(--input-border);
		color: var(--text-secondary);
		padding: var(--spacing-lg);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-base);
		font-weight: 500;
		font-size: var(--text-base);
		position: relative;
		overflow: hidden;
	}

	.option-btn::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--background);
		opacity: 0;
		transition: opacity var(--transition-base);
	}

	.option-btn:hover {
		border-color: rgba(99, 102, 241, 0.5);
		transform: translateY(-2px);
	}

	.option-btn.active {
		border-color: transparent;
		color: white;
		box-shadow: var(--shadow-primary);
	}

	.option-btn.active::before {
		opacity: 1;
	}

	.option-btn .option-label {
		position: relative;
		z-index: var(--z-base);
	}

	.slider-container {
		margin-top: var(--spacing-sm);
	}

	.slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 6px;
		background: var(--slider-track);
		border-radius: 3px;
		outline: none;
		cursor: pointer;
		position: relative;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		background: var(--background);
		cursor: pointer;
		border-radius: 50%;
		box-shadow: 0 2px 8px rgba(99, 102, 241, 0.5);
		transition: transform var(--transition-fast);
	}

	.slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		background: var(--background);
		cursor: pointer;
		border-radius: 50%;
		border: none;
		box-shadow: 0 2px 8px rgba(99, 102, 241, 0.5);
		transition: transform var(--transition-fast);
	}

	.slider:hover::-webkit-slider-thumb {
		transform: scale(1.2);
	}

	.slider:hover::-moz-range-thumb {
		transform: scale(1.2);
	}

	.slider:active::-webkit-slider-thumb {
		transform: scale(1.3);
	}

	.slider:active::-moz-range-thumb {
		transform: scale(1.3);
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		margin-top: var(--spacing-sm);
		font-size: var(--text-xs);
		color: var(--text-placeholder);
	}

	.checkbox-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--spacing-md);
	}

	.checkbox-btn {
		background: var(--input-bg);
		border: 1.5px solid var(--input-border);
		color: var(--text-secondary);
		padding: var(--spacing-lg);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-base);
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		font-weight: 500;
		font-size: var(--text-base);
		position: relative;
		overflow: hidden;
	}

	.checkbox-btn::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--background);
		opacity: 0;
		transition: opacity var(--transition-base);
	}

	.checkbox-btn:hover {
		border-color: rgba(99, 102, 241, 0.5);
		transform: translateY(-2px);
	}

	.checkbox-btn.active {
		border-color: transparent;
		color: white;
		box-shadow: var(--shadow-primary);
	}

	.checkbox-btn.active::before {
		opacity: 1;
	}

	.checkbox-btn span {
		position: relative;
		z-index: var(--z-base);
	}

	.check-icon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		border: 1.5px solid currentColor;
		flex-shrink: 0;
	}

	.checkbox-btn.active .check-icon {
		border-color: white;
	}

	.duration-input {
		position: relative;
		display: flex;
		align-items: center;
	}

	.duration-input input {
		width: 100%;
		padding: var(--spacing-lg) 5rem var(--spacing-lg) var(--spacing-lg);
		background: var(--input-bg);
		border: 1.5px solid var(--input-border);
		border-radius: var(--radius-md);
		color: white;
		font-size: var(--text-lg);
		font-weight: 500;
		transition: all var(--transition-base);
	}

	.duration-input input:focus {
		outline: none;
		border-color: var(--input-focus-border);
		background: var(--input-focus-bg);
	}

	.input-suffix {
		position: absolute;
		right: var(--spacing-lg);
		color: var(--text-placeholder);
		font-size: var(--text-base);
		pointer-events: none;
	}

	.toggles {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.toggle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		padding: var(--spacing-lg);
		background: var(--input-bg);
		border-radius: var(--radius-md);
		border: 1.5px solid var(--input-border);
		transition: all var(--transition-base);
		gap: var(--spacing-lg);
	}

	.toggle-row:hover {
		border-color: rgba(99, 102, 241, 0.5);
		background: rgba(99, 102, 241, 0.05);
	}

	.toggle-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		flex: 1;
	}

	.toggle-title {
		font-weight: 500;
		font-size: var(--text-md);
		color: var(--text-primary);
	}

	.toggle-desc {
		font-size: var(--text-sm);
		color: var(--text-placeholder);
	}

	.toggle-row input {
		display: none;
	}

	.toggle-switch {
		width: 48px;
		height: 28px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		position: relative;
		transition: all var(--transition-smooth);
		flex-shrink: 0;
	}

	.toggle-switch::after {
		content: '';
		position: absolute;
		width: 20px;
		height: 20px;
		background: white;
		border-radius: 50%;
		top: 4px;
		left: 4px;
		transition: all var(--transition-smooth);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	input:checked + .toggle-switch {
		background: var(--background);
	}

	input:checked + .toggle-switch::after {
		transform: translateX(20px);
	}

	.actions {
		display: flex;
		gap: var(--spacing-lg);
		padding: var(--spacing-2xl);
		background: rgba(0, 0, 0, 0.2);
		border-top: 1px solid var(--border-light);
		justify-content: space-between;
	}

	@media (max-width: 640px) {
		.page-container {
			padding: var(--spacing-lg);
		}

		.config-card {
			border-radius: 20px;
		}

		header {
			padding: var(--spacing-2xl) var(--spacing-2xl) var(--spacing-xl);
		}

		.header-content h2 {
			font-size: var(--text-xl);
		}

		.config-sections {
			padding: var(--spacing-lg);
			gap: var(--spacing-lg);
		}

		.section-card {
			padding: var(--spacing-xl);
		}

		.resolution-grid {
			grid-template-columns: 1fr;
		}

		.checkbox-grid {
			grid-template-columns: 1fr;
		}

		.actions {
			flex-direction: column;
			padding: var(--spacing-lg);
		}

		.btn {
			width: 100%;
		}
	}
</style>
