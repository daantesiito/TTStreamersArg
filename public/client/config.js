const firebaseConfig = {
    apiKey: "AIzaSyDPj0VyZWzCYzJ_OSFOz5ntQtSkZ8ojYHY",
    authDomain: "ttstreamersarg.firebaseapp.com",
    projectId: "ttstreamersarg",
    storageBucket: "ttstreamersarg.firebasestorage.app",
    messagingSenderId: "490396668979",
    appId: "1:490396668979:web:9142663ddda1dce8367f46",
    measurementId: "G-9GGKWZYFPH"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

const loginWithTwitchButton = document.getElementById("loginWithTwitchButton");
const userInfo = document.getElementById("userInfo");
const userAvatar = document.getElementById("userAvatar");
const userName = document.getElementById("userName");
const botSection = document.getElementById("bot-section");
const addBotButton = document.getElementById("addBotButton");
const generatedLinkContainer = document.getElementById("generated-link");
const ttsLinkInput = document.getElementById("ttsLink");

if (loginWithTwitchButton) {
    loginWithTwitchButton.addEventListener("click", () => {
        const clientId = '9ul5w7my71i8cyji7q95lgl7grxagc';
        // Nota: Cambia el redirectUri a producción cuando corresponda.
        const redirectUri = 'https://ttstreamersarg.onrender.com/';
        // Solicitar scopes para leer y gestionar redenciones
        const scope = 'user:read:email channel:read:redemptions channel:manage:redemptions';
        const responseType = 'token';

        const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=${responseType}&scope=${encodeURIComponent(scope)}`;
        window.location.href = twitchAuthUrl;
    });
}

function handleTwitchAuth() {
    const hash = window.location.hash;
    if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        if (accessToken) {
            // Guardamos el access token para usarlo luego en la activación del bot
            localStorage.setItem("access_token", accessToken);

            fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Client-Id': '9ul5w7my71i8cyji7q95lgl7grxagc'
                }
            })
            .then(response => response.json())
            .then(data => {
                const user = data.data[0];
                const userId = user.id;
                localStorage.setItem("user_id", userId);
                localStorage.setItem("username", user.display_name);

                // Guardar el streamer en Firestore (si no existe)
                db.collection("streamers").doc(userId).set({
                    username: user.display_name,
                    userId: userId
                }, { merge: true })
                .then(() => console.log("Streamer guardado en Firestore"))
                .catch(error => console.error("Error guardando en Firestore:", error));

                mostrarUsuario(user.display_name, user.profile_image_url);
            })
            .catch(error => console.error('Error al obtener usuario de Twitch:', error));
        }
    } else {
        const storedUsername = localStorage.getItem("username");
        const storedAvatar = localStorage.getItem("userAvatar");
        if (storedUsername && storedAvatar) {
            mostrarUsuario(storedUsername, storedAvatar);
        }
    }
}

function mostrarUsuario(name, avatarUrl) {
    loginWithTwitchButton.style.display = "none";
    userInfo.classList.remove("hidden");
    userAvatar.src = avatarUrl;
    userName.textContent = `Bienvenido, ${name}`;
    botSection.classList.remove("hidden");
}

// Al hacer clic en “Agregar Bot”, se llama a la API de nuestro servidor para activar el bot en ese canal
if (addBotButton) {
    addBotButton.addEventListener("click", () => {
        // El nombre de usuario es el nombre de canal de Twitch
        const username = localStorage.getItem("username");
        const broadcasterId = localStorage.getItem("user_id");
        const accessToken = localStorage.getItem("access_token");
        if (!username || !broadcasterId || !accessToken) return;

        fetch('/activate-bot', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ channel: username, broadcaster_id: broadcasterId, accessToken })
        })
        .then(response => response.json())
        .then(data => {
            console.log("Bot activado en el canal", data);
            // Mostrar el link para OBS personalizado
            generatedLinkContainer.classList.remove("hidden");
            ttsLinkInput.value = data.obsLink;
        })
        .catch(error => console.error('Error activando bot:', error));
    });
}

handleTwitchAuth();

function copyToClipboard() {
  ttsLinkInput.select();
  document.execCommand("copy");
  alert("Link copiado!");
}
