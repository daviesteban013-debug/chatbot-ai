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

## Conversación sin pulsar el micrófono en cada turno

Al encender Jarvis se arma la escucha continua del navegador y se solicita permiso para usar el micrófono si todavía no está concedido. Después del saludo puedes hablar: cada transcripción final aceptada envía una instrucción. La captura se pausa mientras se procesa la respuesta, se prepara/reproduce la voz o queda una reproducción pendiente de un toque, evitando que Jarvis transcriba su propia voz. Al terminar retoma automáticamente la escucha, con una breve separación de 350 ms.

Los cortes normales por silencio reconectan la sesión. Si el navegador falla repetidamente, no tiene micrófono o deniega el permiso, se detiene y muestra un mensaje; no vuelve a solicitar permiso en bucle. El botón de micrófono ahora pausa/reactiva la escucha continua. Apagar Jarvis, salir o desmontar la pantalla cancela también los reinicios pendientes. Los paneles y una pestaña oculta suspenden la captura; al volver a esta pantalla se reanuda únicamente la sesión que habías activado.

No escucha con la aplicación cerrada, ni puede oír sin un micrófono y el permiso del navegador. Se usa SpeechRecognition/webkitSpeechRecognition cuando está disponible; su procesamiento puede depender del servicio de reconocimiento del navegador. El texto funciona aunque no esté disponible la voz. No se guarda una preferencia que encienda el micrófono por sí sola al recargar la página.

## Avatar

Jarvis es una esfera de metal líquido en 3D, con ojos luminosos, reflejos de estudio y dos gotas flotantes. El avatar y los controles de la pantalla principal comparten el dorado de la página sobre fondo negro. El acento personalizado del estudio se conserva en su configuración.

Los ojos siguen el cursor con suavidad. Tocar o pulsar Enter/Espacio sobre la esfera la deforma brevemente; si Jarvis estaba en espera también lo enciende. En espera entrecierra los ojos; al escuchar los abre, al procesar cambia su expresión y su superficie, y al hablar tiene un movimiento más expresivo. Estas animaciones representan estados reales del agente, sin simular una medición de voz o micrófono.

El componente `components/jarvis/liquid-avatar.tsx` usa la dependencia Three.js existente, un shader de deformación y materiales físicos. No descarga texturas ni modelos externos. Limita el renderizado a 30 FPS, reduce la resolución en móvil, pausa cuando el documento está oculto o el avatar sale de pantalla, y libera geometrías, materiales, texturas y el contexto al desmontarse.

Con reducción de movimiento queda estático y se actualiza solo al cambiar estado o tamaño. Si WebGL no está disponible o pierde el contexto, se conserva una esfera con ojos dibujada en CSS. La entrada de texto, la voz ElevenLabs y los dos aplausos siguen disponibles.

## Verificación

`npm run test:jarvis` incluye pares de transitorios, ruido continuo, ecos, pausas largas, permiso denegado o tardío, dispositivo suspendido, liberación de recursos y protección frente a callbacks antiguos. Estas pruebas usan señales sintéticas; la sensibilidad con aplausos físicos depende del micrófono y del ambiente.
