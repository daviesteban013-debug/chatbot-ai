# Personalización de Jarvis

En `/dashboard/jarvis`, abre **Personalización**. Puedes elegir nombre o apodo, trato de tú o usted, respuestas breves o detalladas, voz, variante del español, velocidad y entonación. **Escuchar prueba** permite probar antes de guardar.

La personalidad del asistente se cambia en **Ajustes Manuales**. Guardarla y regresar al chat aplica la nueva configuración sin recargar la página.

## Recuerdos personales

Con una sesión iniciada, escribe o di **«recuerda que prefiero ejemplos prácticos»**. El servidor guarda únicamente comandos explícitos que empiezan por «recuerda que» o «Jarvis, recuerda que». Se admiten 20 recuerdos de hasta 240 caracteres. Jarvis confirma la operación solamente si se guardó; los errores y la memoria llena se muestran sin descartar recuerdos anteriores.

Puedes editar o borrar recuerdos en el panel y pulsar **Guardar personalización**. Una nueva conversación conserva las preferencias. El perfil pertenece al usuario autenticado, no al negocio ni a todos sus miembros. Se almacena en `user_metadata.jarvis_personalization` de Supabase Auth y nunca se usa para conceder permisos.

Los visitantes pueden probar la voz; guardar preferencias requiere iniciar sesión. El selector recupera las voces cuando el navegador termina de cargarlas. Si una voz guardada no existe en otro dispositivo, se elige otra voz en español.

## Voz adaptativa

La adaptación ajusta la velocidad y entonación del navegador según el tono configurado, y ralentiza explicaciones largas, pasos o cifras. Con ElevenLabs ajusta velocidad y estabilidad. No identifica emociones ni clona voces. En Motor de voz puedes elegir Automático, ElevenLabs o Voz del dispositivo. Consulta [la configuración de ElevenLabs](jarvis-elevenlabs.md).

Solo se leen respuestas nuevas, nunca el historial al abrir la página. El audio se cancela al iniciar otra entrada, silenciar, reiniciar el chat o salir. El micrófono usa la variante de español seleccionada.

## Instalación y comprobación

La voz del dispositivo no requiere variables adicionales. ElevenLabs requiere `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID`; `ELEVENLABS_MODEL` es opcional. La clave se utiliza solo en el servidor, y generar audio requiere iniciar sesión.

Antes de publicar, aplica `supabase/migrations/005_jarvis_private_sessions.sql` en el editor SQL de tu proyecto Supabase o con el flujo de migraciones que utilices. Restringe la lectura y escritura directa de sesiones y mensajes al dueño autenticado. El endpoint también verifica pertenencia al negocio y dueño de la conversación antes de acceder a datos o herramientas.

Comprobaciones locales:

```powershell
npm run test:jarvis
npx tsc --noEmit
npm run build
```

Para comprobar con tu cuenta: guarda un apodo y una voz, envía un comando «recuerda que…», inicia una nueva conversación y comprueba el recuerdo en Personalización. Bórralo, guarda y vuelve a abrir el panel para confirmar que se eliminó. Los tests automatizados usan un cliente simulado y no modifican cuentas reales.
## Entrada principal y encendido

Crear cuenta, confirmar correo e iniciar sesión llevan a `/dashboard/jarvis`. Jarvis ocupa toda la pantalla; el CRM se abre con el enlace **Abrir CRM** o el comando escrito/hablado **«Jarvis, abre el CRM»**. La configuración manual en `/onboarding` sigue disponible, pero ya no bloquea el acceso al CRM.

Jarvis empieza en espera, con el micrófono apagado. **Encender Jarvis** o **«Jarvis, enciéndete»** escrito lo activan. Para despertarlo por voz, pulsa **Activar comando de voz**, permite el micrófono y di la frase. En espera, otras frases no se envían al agente. La escucha de encendido termina al despertar, al detenerla, ante errores de permisos/conexión o al ocultar la pestaña. No funciona con el navegador cerrado.

Con Jarvis activo, el micrófono captura una instrucción por pulsación. **«Jarvis, apágate»** o **Poner en espera** detienen voz, escucha y la respuesta pendiente; conservan el historial. El encendido usa un saludo local y no hace una petición al modelo. Si el reconocimiento no está disponible, los botones y comandos escritos siguen funcionando.
