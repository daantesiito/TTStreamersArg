// Obtenemos el canal (streamer) de la URL, por ejemplo: /obs?channel=Chabon
const params = new URLSearchParams(window.location.search);
const channel = params.get('channel');

if (!channel) {
  document.body.innerHTML = "No se especificó un canal.";
}

// Conectar al namespace de OBS y enviar el canal como parámetro
const socket = io('/', { query: { channel } });

socket.on('connect', () => {
  console.log("Conectado al TTS para el canal:", channel);
});

// Cuando llega un evento 'tts', reproducir el audio
socket.on('tts', (data) => {
  // data.audioData debe ser una data URI (por ejemplo, "data:audio/mp3;base64,...")
  const audio = new Audio(data.audioData);
  audio.play().catch(err => console.error("Error al reproducir audio:", err));
});
