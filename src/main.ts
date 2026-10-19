import '@fontsource/jetbrains-mono/400.css';
import './app.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';

registerSW({ immediate: true });

export default mount(App, { target: document.getElementById('app')! });
