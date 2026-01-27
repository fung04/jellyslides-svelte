<script lang="ts">
	import { goto } from '$app/navigation';
	import { serverConfig, appConfig } from '$lib/stores';
	import { onMount } from 'svelte';

	let quality = $state(1080);
	let duration = $state(30);
	let wakeLock = $state(false);
	let websocket = $state(false);
	let selectedTypes = $state(['Movie', 'Series']);

	// Available options
	const qualityOptions = [
		{ label: 'Original (4K+)', value: 2160 },
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
			goto('/');
			return;
		}

		// Load existing config
		quality = $appConfig.pictureQuality;
		duration = $appConfig.duration / 1000; // Convert to seconds for input
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
			pictureQuality: quality,
			libraryParams: selectedTypes,
			duration: duration * 1000, // Convert back to ms
			wakeLock,
			websocket
		});

		goto('/slideshow');
	}

	function handleLogout() {
		serverConfig.set(null);
		goto('/');
	}
</script>

<div class="page-container">
	<div class="config-card glass">
		<header>
			<h2>Configuration</h2>
			<p>Customize your slideshow experience</p>
		</header>

		<div class="config-sections">
			<!-- Picture Quality -->
			<section>
				<h3>Picture Quality</h3>
				<div class="quality-grid">
					{#each qualityOptions as opt}
						<button
							class="option-btn {quality === opt.value ? 'active' : ''}"
							onclick={() => (quality = opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</section>

			<!-- Library Content -->
			<section>
				<h3>Library Content</h3>
				<div class="checkbox-grid">
					{#each typeOptions as type}
						<button
							class="checkbox-btn {selectedTypes.includes(type.value) ? 'active' : ''}"
							onclick={() => toggleType(type.value)}
						>
							<span class="check-icon">{selectedTypes.includes(type.value) ? '✓' : ''}</span>
							{type.label}
						</button>
					{/each}
				</div>
			</section>

			<!-- Slideshow Settings -->
			<section>
				<h3>Settings</h3>
				<div class="form-row">
					<div class="form-group">
						<label for="duration">Duration (seconds)</label>
						<input type="number" id="duration" class="form-input" min="5" bind:value={duration} />
					</div>
				</div>

				<div class="toggles">
					<label class="toggle-row">
						<span>Enable Wake Lock (Prevent Sleep)</span>
						<input type="checkbox" bind:checked={wakeLock} />
						<span class="toggle-switch"></span>
					</label>

					<label class="toggle-row">
						<span>Enable Remote Control (WebSocket)</span>
						<input type="checkbox" bind:checked={websocket} />
						<span class="toggle-switch"></span>
					</label>
				</div>
			</section>
		</div>

		<div class="actions">
			<button class="btn btn-secondary" onclick={handleLogout}>Logout</button>
			<button class="btn btn-primary start-btn" onclick={handleSave}>Start Slideshow</button>
		</div>
	</div>
</div>

<style>
	.page-container {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		min-height: 100vh;
		background: radial-gradient(circle at top left, #1a2a3a 0%, #050505 100%);
		padding: 2rem 1rem;
	}

	.config-card {
		width: 100%;
		max-width: 600px;
		padding: 2.5rem;
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	header {
		border-bottom: 1px solid var(--border);
		padding-bottom: 1rem;
	}

	header h2 {
		margin-bottom: 0.5rem;
	}

	header p {
		color: var(--text-muted);
	}

	section {
		margin-bottom: 2rem;
	}

	section h3 {
		font-size: 1.1rem;
		margin-bottom: 1rem;
		color: var(--primary);
	}

	.quality-grid,
	.checkbox-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1rem;
	}

	.option-btn,
	.checkbox-btn {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 1rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.2s;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.option-btn:hover,
	.checkbox-btn:hover {
		border-color: var(--primary);
	}

	.option-btn.active,
	.checkbox-btn.active {
		background: var(--primary);
		border-color: var(--primary);
		color: white;
	}

	.check-icon {
		font-weight: bold;
		width: 1rem;
	}

	.toggles {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.toggle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		padding: 0.75rem;
		background: var(--surface);
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
	}

	.toggle-row input {
		display: none;
	}

	.toggle-switch {
		width: 48px;
		height: 24px;
		background: var(--surface-light);
		border-radius: 12px;
		position: relative;
		transition: 0.3s;
		border: 1px solid var(--text-muted);
	}

	.toggle-switch::after {
		content: '';
		position: absolute;
		width: 20px;
		height: 20px;
		background: white;
		border-radius: 50%;
		top: 1px;
		left: 2px;
		transition: 0.3s;
	}

	input:checked + .toggle-switch {
		background: var(--primary);
		border-color: var(--primary);
	}

	input:checked + .toggle-switch::after {
		transform: translateX(22px);
	}

	.actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 1rem;
		border-top: 1px solid var(--border);
		padding-top: 1.5rem;
	}

	.start-btn {
		padding: 0.75rem 2rem;
		font-size: 1.1rem;
	}
</style>
