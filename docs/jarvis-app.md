# Jarvis como app instalable

La PWA usa la misma web, cuenta y CRM. El icono se llama **Jarvis** y abre `/dashboard/jarvis` en una ventana independiente. Sin sesión, primero aparece el inicio de sesión y después Jarvis.

- **Chrome o Edge en PC / Android:** pulsa **Instalar app** en Jarvis, en el CRM o en la página principal. Si el navegador ofrece la instalación, confirma su diálogo. También puedes usar la opción de instalación del menú o de la barra de direcciones.
- **iPhone o iPad:** abre la web en el navegador, pulsa **Compartir → Añadir a pantalla de inicio**, activa **Abrir como app** si aparece y confirma **Añadir**.
- **Navegadores integrados en otras apps:** abre la URL en Chrome, Edge o Safari para instalar. El navegador integrado de Codex puede mostrar solo las instrucciones.

Jarvis, el reconocimiento de voz y las consultas del CRM necesitan internet. Si abres la app sin conexión, muestra una pantalla de reconexión. El service worker guarda únicamente esa pantalla pública y los iconos enumerados en `public/sw.js`: nunca almacena chats, respuestas del CRM, cookies, datos de autenticación ni peticiones a la API. Tampoco reintenta operaciones del CRM en segundo plano.

Las actualizaciones llegan desde la web. No necesitas reinstalarla para cada cambio. No hay notificaciones push, publicación en tiendas ni escucha de voz con la app cerrada.

Archivos: `app/manifest.ts`, `components/pwa/app-provider.tsx`, `public/sw.js`, `public/offline.html`, `public/icons/`. El SVG es la fuente de los PNG; el contenido principal queda dentro del área segura para iconos maskable. Si cambias los archivos precacheados, incrementa `CACHE_NAME` en el worker.

Verificación: `npm run test:pwa`, `npm run build`. Comprueba en HTTPS el manifest, los iconos, el botón, las instrucciones de iOS y el arranque sin sesión. La instalación definitiva depende del navegador/dispositivo; el usuario confirma el diálogo del sistema.
