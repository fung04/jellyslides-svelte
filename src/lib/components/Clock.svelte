<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let { onclick } = $props();
	let currentTime = $state('');
	let timeInterval: any;

	function updateTime() {
		const now = new Date();
		const options: Intl.DateTimeFormatOptions = {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour12: false
		};
		// Try to match original formatting: "Fri, 27 Aug 2021, 14:30:45"
		currentTime = now.toLocaleString('en-GB', options);
	}

	onMount(() => {
		updateTime();
		timeInterval = setInterval(updateTime, 1000);
	});

	onDestroy(() => {
		if (timeInterval) clearInterval(timeInterval);
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="clock" {onclick}>
	{currentTime}
</div>

<style>
	.clock {
		position: absolute;
		top: 20px;
		right: 20px;
		z-index: 50;
		color: rgba(255, 255, 255, 0.7);
		font-family: 'Noto Sans Display', sans-serif;
		font-size: 1.2rem;
		font-weight: 500;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
		cursor: pointer;
		transition: color 0.3s ease;
		user-select: none;
	}

	.clock:hover {
		color: rgba(255, 255, 255, 1);
	}
</style>
