require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const tmi = require('tmi.js');
const fetch = require('node-fetch'); // Asegurate de tener esta dependencia
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Configuraciones
const PORT = process.env.PORT || 8000;
const BOT_USERNAME = process.env.BOT_USERNAME;
const BOT_OAUTH_TOKEN = process.env.BOT_OAUTH_TOKEN;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

// Mapeo de nombres de streamer a ID de voz en ElevenLabs
const voiceMapping = {
  "chabon": "F0uPYyt0vZfuW7bNZVe4",
  "florchus": "KmRjm2N8YGCdT53uFLNR",
  "baulo": "T9PR8sIONLHl3sVzzs02",
  "melian": "qth8SugvxIOLJ73ZygrE",
  "nanoide": "YEmZfvibUmrQ9Q5qZd5J",
  "mortedor": "LY7WgqA3k94pCgjw0Qxv",
  "athhe": "X3o4ip4LI8174anw68pf",
  "aldimirco": "9ZV0h8ZjupZesKzHUjga",
  "harryalex": "V3qIQaqjgoMuwaOU93Mv",
  "joaconeco": "FE0tCCs2lcjaI5oFcHwf"
};

// Mapeo de voces a sus ajustes
const voiceSettingsMapping = {
  "chabon": {
    stability: 0.9,
    similarity_boost: 1.0,
    style: 0.60,
    speed: 0.97,
    use_speaker_boost: true
  },
  "florchus": {
    stability: 0.6,
    similarity_boost: 0.93,
    style: 0.63,
    speed: 0.95,
    use_speaker_boost: true
  },
  "baulo": {
    stability: 0.6,
    similarity_boost: 0.80,
    style: 0.43,
    speed: 1.01,
    use_speaker_boost: true
  },
  "melian": {
    stability: 0.81,
    similarity_boost: 0.94,
    style: 0.46,
    speed: 0.94,
    use_speaker_boost: true
  },
  "nanoide": {
    stability: 0.82,
    similarity_boost: 1.0,
    style: 0.54,
    speed: 1.02,
    use_speaker_boost: true
  },
  "mortedor": {
    stability: 0.81,
    similarity_boost: 0.93,
    style: 0.5,
    speed: 1.04,
    use_speaker_boost: true
  },
  "rageylo": {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.3,
    speed: 1.0,
    use_speaker_boost: true
  },
  "aldimirco": {
    stability: 0.81,
    similarity_boost: 0.94,
    style: 0.42,
    speed: 1.03,
    use_speaker_boost: true
  },
  "harryalex": {
    stability: 0.75,
    similarity_boost: 0.69,
    style: 0.49,
    speed: 1.0,
    use_speaker_boost: true
  },
  "joaconeco": {
    stability: 0.68,
    similarity_boost: 0.82,
    style: 0.41,
    speed: 1.02,
    use_speaker_boost: true
  },
  "athhe": {
    stability: 0.74,
    similarity_boost: 0.70,
    style: 0.32,
    speed: 1.04,
    use_speaker_boost: true
  }
};

// Si no se define una voz específica, usar valores por defecto
const defaultSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.3,
  speed: 1.0,
  use_speaker_boost: true
};

// Mapeo para guardar el ID del reward "TTS" por canal (clave: nombre del canal en minúsculas)
const rewardMapping = {};

// Lista de canales activos (en producción, convendría persistir esto)
const activeChannels = new Set();

// Servir archivos estáticos desde la carpeta "client"
app.use(express.static(path.join(__dirname, '..', 'client')));
// Servir archivos estáticos desde la carpeta "obs"
app.use(express.static(path.join(__dirname, '..', 'obs')));

app.use(bodyParser.json());

/**
 * Función para obtener el ID de la reward "TTS" para un canal.
 */
async function obtenerRewardTTS(broadcasterId, streamerAccessToken) {
  const url = `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`;
  const response = await fetch(url, {
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${streamerAccessToken}`
    }
  });

  if (!response.ok) {
    console.error("Error al obtener rewards:", response.statusText);
    return null;
  }

  const data = await response.json();
  // Buscar la reward con title "TTS"
  const rewardTTS = data.data.find(reward => reward.title === "TTS");
  if (!rewardTTS) {
    console.log("No se encontró el reward 'TTS' en el canal");
    return null;
  }
  return rewardTTS.id;
}

/**
 * Función para crear la reward "TTS" si no existe.
 * Requiere el scope "channel:manage:redemptions".
 */
async function crearRewardTTS(broadcasterId, streamerAccessToken) {
  const url = `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcasterId}`;
  const rewardPayload = {
    title: "TTS",
    prompt: "Para enviar un mensaje con voz personalizada tenés que respetar este formato: '(nombreStreamer: mensaje)'. Por ejemplo: 'baulo: hola123'. DISPONIBLES: 'florchus', 'chabon', 'baulo', 'melian', 'nanoide', 'mortedor', 'aldimirco', 'harryalex', 'joaconeco', 'athhe'",
    cost: 1000,          
    is_enabled: true,
    is_user_input_required: true,
    global_cooldown_setting: {
      is_enabled: true,
      global_cooldown_seconds: 15
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${streamerAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(rewardPayload)
  });

  if (!response.ok) {
    console.error("Error al crear reward TTS:", response.statusText);
    return null;
  }

  const data = await response.json();
  if (data.data && data.data.length > 0) {
    console.log("Reward 'TTS' creada exitosamente.");
    return data.data[0].id;
  }
  return null;
}

// Endpoint para activar el bot en un canal
// Ahora se esperan: channel, broadcaster_id y accessToken (del streamer con los scopes necesarios)
app.post('/activate-bot', async (req, res) => {
  const { channel, broadcaster_id, accessToken } = req.body;
  if (!channel || !broadcaster_id || !accessToken) {
    return res.status(400).json({ error: 'Faltan datos: channel, broadcaster_id o accessToken' });
  }
  const channelLower = channel.toLowerCase();
  activeChannels.add(channelLower);

  try {
    // Intentar obtener el reward "TTS" para el canal
    let rewardId = await obtenerRewardTTS(broadcaster_id, accessToken);
    if (!rewardId) {
      // Si no existe, crearlo (requiere el scope "channel:manage:redemptions")
      console.log("Reward TTS no encontrado. Se procede a crearlo.");
      rewardId = await crearRewardTTS(broadcaster_id, accessToken);
    }
    if (rewardId) {
      // Guardar el reward id en el mapping para usarlo en el listener de mensajes
      rewardMapping[channelLower] = rewardId;
      console.log(`Reward TTS para ${channelLower} es ${rewardId}`);
    } else {
      console.log("No se pudo obtener ni crear el reward TTS. Verifica los scopes y permisos.");
    }
    // Instruir al bot a unirse al canal
    client.join(`#${channelLower}`)
      .then(() => {
        console.log(`Bot unido al canal: ${channelLower}`);
        // Generar link personalizado para OBS
        const obsLink = `${process.env.DOMAIN || 'https://ttstreamersarg.onrender.com'}/obs.html?channel=${channelLower}`;
        res.json({ success: true, obsLink });
      })
      .catch(err => {
        console.error("Error al unir bot:", err);
        res.status(500).json({ error: 'Error al unir el bot al canal' });
      });
  } catch (err) {
    console.error("Error en la activación:", err);
    res.status(500).json({ error: 'Error al obtener/crear reward TTS' });
  }
});

// Inicializar cliente de Twitch (tmi.js)
const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: BOT_USERNAME,
    password: BOT_OAUTH_TOKEN
  },
  channels: Array.from(activeChannels) // Inicialmente vacío
});

client.connect().catch(console.error);

async function emitirErrorChat(channel) {
  try {
    // Enviamos el mensaje al chat. Asegurate de que 'channel' incluya el "#" si es necesario.
    await client.say(channel, "La estructura del mensaje no es válida. Debe ser 'STREAMER:MENSAJE'.");
    console.log(`Mensaje de error enviado al chat de ${channel}`);
  } catch (err) {
    console.error("Error al enviar mensaje de error al chat:", err);
  }
}

// Escuchar mensajes en el chat y detectar la redención de reward TTS
client.on('message', async (channel, tags, message, self) => {
  if (self) return; // No procesar mensajes del propio bot

  const channelName = channel.replace("#", "");
  // Validar que se haya redimido una reward y que para este canal tengamos el reward TTS registrado
  if (tags && tags['custom-reward-id'] && rewardMapping[channelName] &&
      tags['custom-reward-id'] === rewardMapping[channelName]) {

    // Verificar la estructura del mensaje
    if (!message.includes(":")) {
      console.log("La estructura del mensaje no es válida. Se enviará mensaje de error al chat.");
      await emitirErrorChat(channel); // Enviamos el mensaje de error al chat
      return;
    }

    // Separar el nombre del streamer y el mensaje
    let [streamerName, ...rest] = message.split(":");
    streamerName = streamerName.trim().toLowerCase();
    const ttsMessage = rest.join(":").trim();

    if (!ttsMessage) {
      console.log("El mensaje TTS está vacío, se ignora.");
      return;
    }

    try {
      // Seleccionar el voiceId según el streamer
      const voiceId = voiceMapping[streamerName];
      if (!voiceId) {
        console.error(`No se encontró una voz configurada para ${streamerName}.`);
        return; // O manejar el caso de otra forma (por ejemplo, enviar un mensaje de error al chat)
      }      

      // Buscar ajustes de la voz (o usar default)
      const voiceSettings = voiceSettingsMapping[streamerName] || defaultSettings;

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: ttsMessage,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: voiceSettings.stability,
            similarity_boost: voiceSettings.similarity_boost,
            style: voiceSettings.style,
            speed: voiceSettings.speed,
            use_speaker_boost: voiceSettings.use_speaker_boost
          }
        })
      });  

      if (!response.ok) {
        console.error("Error en la API de ElevenLabs:", response.statusText);
        return;
      }

      // Convertir la respuesta en buffer y luego a base64 para generar la data URI
      const audioBuffer = await response.buffer();
      const base64Audio = audioBuffer.toString('base64');
      const dataUri = `data:audio/mp3;base64,${base64Audio}`;

      // Enviar el audio al OBS mediante Socket.IO (usamos el room que es el nombre del canal)
      io.to(channelName).emit('tts', { audioData: dataUri });
      console.log(`Audio TTS emitido para ${channelName}: ${ttsMessage}`);
    } catch (err) {
      console.error("Error al generar TTS para la reward:", err);
    }
  }
});

// Configurar Socket.IO para que cada cliente (OBS) se una a su "room" basado en el canal
io.on('connection', (socket) => {
  const { channel } = socket.handshake.query;
  if (channel) {
    console.log(`OBS conectado para el canal: ${channel}`);
    socket.join(channel);
  }
  socket.on('disconnect', () => {
    console.log('OBS desconectado');
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
