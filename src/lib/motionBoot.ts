/* Kept outside the "use client" Motion module: a constant exported from a client module is not readable in a server layout. */
/** Runs before hydration: turns motion on, and off again if the app never boots, so content can never stay hidden. */
export const MOTION_BOOT =
  "(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.classList.add('motion');setTimeout(function(){if(!window.__svMotion)d.classList.remove('motion')},4000)}catch(e){}})();";
