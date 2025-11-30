// public/js/index.js

// Esta URL debe coincidir con la URL base de tu servidor (render.com o localhost)
// Como tu index.html y este JS se cargan desde el mismo servidor, puedes usar rutas relativas.
const SERVER_URL = "https://alertascolonba.onrender.com"; // Deja esto vacío o usa "." si el servidor está en la misma raíz

async function checkAppVersion() {
    const loadingText = document.getElementById('loading-text');
    const downloadLink = document.getElementById('download-link');
    const versionText = document.getElementById('app-version-text');
    
    try {
        // Llama a la nueva ruta API en tu servidor Express
        const response = await fetch(`${SERVER_URL}/api/version`); 
        const data = await response.json();
        const latestVersion = data.version;

        versionText.textContent = latestVersion;
        
        // Construye el nombre del archivo de instalación basado en la versión
        // ESTA URL ASUME QUE PUBLICAS EN GITHUB RELEASES
        // RECUERDA REEMPLAZAR TU_USUARIO/TU_REPOSITORIO/NombreDeTuApp
        const downloadUrl = `github.com${latestVersion}.exe`;
        
        downloadLink.href = downloadUrl;
        
        loadingText.style.display = 'none';
        downloadLink.style.display = 'inline-block';

    } catch (error) {
        console.error("Error al obtener la versión:", error);
        loadingText.textContent = "Error al cargar la versión.";
    }
}

// Ejecutar la verificación al cargar la página
checkAppVersion();
