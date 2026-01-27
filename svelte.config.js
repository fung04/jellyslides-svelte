import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: '404.html' // Use 404.html for SPA fallback if needed
		}),
		paths: {
			base: process.env.NODE_ENV === 'production' ? '/jellyslides-svelte' : ''
		}
	}
};

export default config;
