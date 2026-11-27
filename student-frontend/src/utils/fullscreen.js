// Fullscreen helpers — vendor-prefixed for Safari/Firefox support.

export const fsSupported = !!(document.documentElement.requestFullscreen
  || document.documentElement.webkitRequestFullscreen
  || document.documentElement.mozRequestFullScreen)

export function enterFs() {
  const el = document.documentElement
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen
  return fn ? fn.call(el) : Promise.resolve()
}

export function exitFs() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen
  return fn ? fn.call(document) : Promise.resolve()
}

export function isFs() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement)
}

// Alias used by Workspace
export const fsActive = isFs
