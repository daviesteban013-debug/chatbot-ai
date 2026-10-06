# Voz por frases de Jarvis

El modo de voz de la pantalla de Jarvis pide al modelo un primer párrafo de una
o dos frases cortas con lo esencial, incluidas las advertencias necesarias. El
texto completo continúa apareciendo en la conversación. La reproducción comienza
con la primera frase completa recibida, antes del evento final del chat.

El cliente limita la introducción hablada a dos frases y 360 caracteres. Listas,
tablas, código y contenido adicional quedan en pantalla; en ese caso añade una
única frase: «Te dejo los detalles en pantalla». La respuesta final no vuelve a
leer los fragmentos que ya se reprodujeron. Las respuestas sin deltas, como las
confirmaciones de memoria, pasan por el mismo límite.

## Audio y compatibilidad

- La voz del dispositivo usa una cola de frases: empieza la siguiente cuando
  termina la anterior.
- ElevenLabs recibe una solicitud autenticada por frase. En navegadores que
  admiten MP3 con MediaSource, los bytes se reproducen mientras llegan del servidor.
  Otros navegadores descargan solamente el audio de esa frase antes de reproducirlo.
- La cola avanza al finalizar la reproducción, no al terminar la descarga. Si el
  navegador bloquea autoplay, «Reproducir voz» continúa el mismo audio sin hacer
  otra solicitud al proveedor. Un error descarta las frases pendientes.
- El límite de voz por proceso permite una ráfaga de tres solicitudes y repone
  una cada dos segundos; conserva el máximo de 20.000 caracteres por diez minutos
  y una solicitud activa por usuario. No sustituye un contador de audio compartido
  entre instancias.
- El avatar y la etiqueta «Hablando contigo» dependen de eventos de reproducción
  real; recibir texto no activa una animación de voz ficticia.

El botón «Detener respuesta y voz» y Escape interrumpen la generación, la descarga,
la reproducción y las frases pendientes. El botón sigue disponible cuando terminó
la generación pero todavía queda audio. Silenciar, apagar Jarvis o abrir un panel
también descartan la cola para impedir que una respuesta antigua suene después.
Es posible escribir una nueva instrucción mientras se reproduce la anterior.

Esta fase conserva el reconocimiento de voz del navegador, que se pausa mientras
Jarvis responde para evitar que transcriba su propia voz. La interrupción hablada
simultánea requiere la siguiente fase de Realtime/WebRTC. No se añadieron nuevos
proveedores ni claves y no se modificó la equivalencia de créditos de texto.

## Verificación

Las pruebas automáticas cubren orden de frases, cancelación y eventos tardíos,
decimales, límites de lectura, respuestas de memoria, SSE fragmentado, MP3
progresivo, fallos de decodificación y recuperación de autoplay. Ejecutar:

    npm run test:jarvis

Para la prueba de escucha real, abrir Jarvis en Chrome/Edge y un móvil:

1. Encenderlo y pedir una explicación con varios pasos. Comprobar que habla una
   introducción breve mientras se completa el texto y deja los pasos en pantalla.
2. Detener durante la descarga y durante la reproducción. Comprobar que ninguna
   frase pendiente comienza después y que la escucha continua se reanuda.
3. Enviar una segunda instrucción mientras habla. Comprobar que se corta la anterior.
4. Probar voz del dispositivo y ElevenLabs; si aparece «Reproducir voz», pulsarlo
   y comprobar que continúa sin generar un segundo audio para la misma frase.
5. Silenciar o abrir Personalización durante una respuesta; cerrar el panel y
   comprobar que la voz descartada no vuelve a empezar.

Las pruebas con objetos de navegador simulados no establecen latencia real ni
calidad de pronunciación. Esas mediciones requieren micrófono, navegador y el
proveedor configurado.

Referencias: [MediaSource](https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/isTypeSupported_static),
[actualizaciones de SourceBuffer](https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer/appendBuffer).
