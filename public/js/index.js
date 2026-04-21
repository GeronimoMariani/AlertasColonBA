// public/js/index.js

const SERVER_URL = "https://alertasbomberoscolonba.com.ar"; 

async function checkAppVersion() {
    const loadingText = document.getElementById('loading-text');
    const downloadLink = document.getElementById('download-link');
    const versionText = document.getElementById('app-version-text');
    
    try {
        const response = await fetch(`${SERVER_URL}/api/version`); 
        const data = await response.json();
        const latestVersion = data.version;

        versionText.textContent = latestVersion;
        
        loadingText.style.display = 'none';
        downloadLink.style.display = 'inline-block';

    } catch (error) {
        console.error("Error al obtener la versión:", error);
        loadingText.textContent = "Error al cargar la versión.";
    }
}

// Manejador de clic universal (funciona en web y Electron)
document.getElementById('download-link').addEventListener('click', (event) => {
    event.preventDefault(); // Previene la navegación estándar del navegador

    const version = document.getElementById('app-version-text').textContent;
    // REEMPLAZA LOS NOMBRES DEL REPOSITORIO Y PRODUCTO EXACTAMENTE
    const url = `https://github.com/GeronimoMariani/AlertasColonBA/releases/download/v${version}/Alertas-Colon-BA-Setup-${version}.exe`;

    // Usamos la API expuesta por preload.js si existe (en Electron)
    if (window.electronAPI) { 
        window.electronAPI.openExternal(url);
    } else {
        // Si estamos en un navegador web normal
        window.open(url, '_blank');
    }
});

// Ejecutar la verificación al cargar la página
checkAppVersion();

