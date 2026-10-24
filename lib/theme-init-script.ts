/**
 * Runs in <head> before the first paint and puts the `dark` class on <html> when the visitor
 * should see the dark theme: no saved choice (dark is the default), "dark", or "system" while the
 * system is dark. Without it the class would arrive after hydration and the page would flash light.
 * Keep the saved key and values in step with `use-theme.tsx`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='light'?false:t==='system'?matchMedia('(prefers-color-scheme: dark)').matches:true;if(d)document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}})()`;
