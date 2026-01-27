<script lang="ts">
	import { goto } from '$app/navigation';
	import { JellyfinApi } from '$lib/jellyfinApi';
	import { serverConfig } from '$lib/stores';
	import { generateDeviceId } from '$lib/utils';
	import { onMount } from 'svelte';

	let url = $state('');
	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');

	onMount(() => {
		if ($serverConfig) {
			url = $serverConfig.baseUrl;
			username = $serverConfig.username;
		}
	});

	async function handleSubmit() {
		if (!url || !username) {
			error = 'Please fill in all fields';
			return;
		}

		loading = true;
		error = '';

		try {
			let cleanUrl = url.trim();
			if (!cleanUrl.startsWith('http')) {
				cleanUrl = 'http://' + cleanUrl;
			}
			// Remove trailing slash
			if (cleanUrl.endsWith('/')) {
				cleanUrl = cleanUrl.slice(0, -1);
			}

			const deviceId = generateDeviceId();

			// Create api instance
			// We pass temporary config just to use helper methods if needed,
			// but for authentication we use the values from proper form
			const tempConfig = {
				baseUrl: cleanUrl,
				username: username,
				userId: '',
				accessToken: '',
				deviceId: deviceId
			};

			const api = new JellyfinApi(tempConfig);
			const authResult = await api.authenticateUser(username, password);

			serverConfig.set({
				baseUrl: cleanUrl,
				username: authResult.User.Name,
				userId: authResult.User.Id,
				accessToken: authResult.AccessToken,
				deviceId: deviceId
			});

			goto('/config');
		} catch (e: any) {
			console.error(e);
			error = 'Connection failed. Please check your URL and credentials.';
			if (e.message) error += ` (${e.message})`;
		} finally {
			loading = false;
		}
	}
</script>

<div class="page-container">
	<div class="login-card glass">
		<div class="logo">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="currentColor"
				class="w-12 h-12"
			>
				<path
					d="M11.968 0C5.394 0 0 5.418 0 12c0 6.643 5.394 12 11.968 12 6.634 0 12.032-5.418 12.032-12 0-6.643-5.385-12-12.032-12zm6.205 17.584c-1.393.743-3.612 1.34-6.197 1.34-4.524 0-7.796-2.454-7.796-6.866 0-4.603 3.498-7.567 8.163-7.567 2.454 0 4.603.488 5.79.996l-.99 2.56c-1.077-.384-2.735-.743-4.543-.743-2.903 0-4.9.932-4.9 4.384 0 3.018 2.053 4.195 4.883 4.195 1.597 0 3.033-.306 4.093-.725l1.492 2.426z"
				/>
			</svg>
			<h1>JellySlides</h1>
			<p>Your media, beautifully displayed.</p>
		</div>

		<form
			class="login-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
		>
			<div class="form-group">
				<label for="url" class="form-label">Server Address</label>
				<input
					type="text"
					id="url"
					class="form-input"
					placeholder="e.g. 192.168.1.100:8096"
					bind:value={url}
				/>
			</div>

			<div class="form-group">
				<label for="username" class="form-label">Username</label>
				<input
					type="text"
					id="username"
					class="form-input"
					placeholder="Username"
					bind:value={username}
				/>
			</div>

			<div class="form-group">
				<label for="password" class="form-label">Password</label>
				<input
					type="password"
					id="password"
					class="form-input"
					placeholder="Password"
					bind:value={password}
				/>
			</div>

			{#if error}
				<div class="error-message fade-in">
					{error}
				</div>
			{/if}

			<button type="submit" class="btn btn-primary login-btn" disabled={loading}>
				{#if loading}
					<span class="spinner"></span> Connecting...
				{:else}
					Connect
				{/if}
			</button>
		</form>
	</div>
</div>

<style>
	.page-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background: radial-gradient(circle at top right, #1a2a3a 0%, #050505 100%);
		padding: 1rem;
	}

	.login-card {
		width: 100%;
		max-width: 420px;
		padding: 2.5rem;
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.logo {
		text-align: center;
	}

	.logo svg {
		width: 64px;
		height: 64px;
		fill: var(--primary);
		margin-bottom: 1rem;
	}

	.logo h1 {
		font-size: 2rem;
		margin-bottom: 0.5rem;
	}

	.logo p {
		color: var(--text-muted);
	}

	.login-btn {
		width: 100%;
		margin-top: 1rem;
		font-size: 1.1rem;
		padding: 1rem;
	}

	.error-message {
		color: #ff4d4d;
		background: rgba(255, 77, 77, 0.1);
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		font-size: 0.9rem;
		text-align: center;
	}

	.spinner {
		display: inline-block;
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: white;
		animation: spin 1s ease-in-out infinite;
		margin-right: 0.5rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
