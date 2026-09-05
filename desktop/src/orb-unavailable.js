const button = document.querySelector('#open-settings')

function openSettings() {
  window.sideAudioBotDesktop.openSettings()
}

button.addEventListener('click', openSettings)
button.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') openSettings()
})
