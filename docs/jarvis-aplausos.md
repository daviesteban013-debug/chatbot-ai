# Jarvis: pantalla principal y encendido con aplausos

Jarvis muestra el avatar al centro y una entrada de texto abajo. El menú abre la conversación, la personalización de voz y la configuración del agente. Los comandos de encendido, apagado y apertura del CRM siguen funcionando por texto y por voz.

## Uso

1. Abre la pantalla de Jarvis en HTTPS o localhost.
2. Con Jarvis en espera, pulsa **Activar 2 aplausos** y permite el micrófono.
3. Espera un segundo de calibración y da dos aplausos separados por unos 400–500 ms.
4. Jarvis se enciende y libera el micrófono del detector antes de saludar.

La escucha debe activarse en cada sesión. No funciona con la app cerrada ni en segundo plano. Cambiar de pestaña, salir, cancelar o perder el dispositivo detiene la captura. El permiso pendiente se cancela a los 30 segundos; una respuesta tardía del navegador no vuelve a encenderla.

El detector usa amplitud, cresta, duración breve, silencio previo y una ventana de 200–950 ms entre golpes. Es una heurística: otros golpes cortos pueden parecer aplausos y el ruido fuerte puede impedir reconocerlos. Siempre están disponibles el botón de encendido y el texto; el comando hablado aparece cuando el navegador soporta reconocimiento de voz.

El audio para detectar aplausos se analiza localmente con Web Audio; no se graba ni se envía al servidor. Es independiente del reconocimiento de voz del navegador y de ElevenLabs. Abrir ajustes, iniciar voz o enviar texto detiene el detector.

## Avatar

Asset generado con la herramienta integrada de imágenes: casco metálico frontal, visor de galaxia violeta, dos ojos luminosos y fondo transparente, inspirado en la referencia del usuario. Se sirve desde `public/jarvis/avatar.webp` (960 × 901). Es una imagen con movimiento CSS; el brillo responde a estados reales de escucha, procesamiento y reproducción. Se respeta la preferencia de reducir movimiento.

## Verificación

`npm run test:jarvis` incluye pares de transitorios, ruido continuo, ecos, pausas largas, permiso denegado o tardío, dispositivo suspendido, liberación de recursos y protección frente a callbacks antiguos. Estas pruebas usan señales sintéticas; la sensibilidad con aplausos físicos depende del micrófono y del ambiente.
