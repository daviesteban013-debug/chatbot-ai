# Voz de Jarvis con ElevenLabs

Jarvis admite voz del dispositivo y ElevenLabs. El motor de texto (`LLM_*`) sigue siendo independiente. No requiere paquetes nuevos ni migraciones.

## Configurar una vez

1. Crea una API key en ElevenLabs con permiso para Text to Speech. Elige una voz en tu biblioteca, escucha su español y copia su Voice ID. La voz elegida será la voz de ElevenLabs compartida por esta instalación de Jarvis.
2. Añade estas variables privadas a `.env.local`, reemplazando los ejemplos:

```dotenv
ELEVENLABS_API_KEY=TU_API_KEY
ELEVENLABS_VOICE_ID=EL_ID_DE_TU_VOZ
ELEVENLABS_MODEL=eleven_multilingual_v2
```

El modelo es opcional: `eleven_multilingual_v2` es el predeterminado. También se admite `eleven_flash_v2_5` para priorizar la latencia. No pongas `NEXT_PUBLIC_` en la clave. No hace falta cambiar `LLM_BASE_URL`, `LLM_API_KEY` ni `LLM_MODEL`.

3. Reinicia `npm run dev`. En Jarvis abre **Personalización → Motor de voz → ElevenLabs**, pulsa **Escuchar prueba** y guarda. Automático elige ElevenLabs cuando las variables están completas y el modelo es admitido; sin ellas elige voz del dispositivo. Si ElevenLabs falla, se muestra el error para elegir otro motor, sin sustituir la voz silenciosamente.
4. Para Production ejecuta `node tools/mcp/env-cli.mjs sync` y publica un nuevo despliegue. La sincronización de variables no publica por sí sola.

La presencia de configuración no comprueba la validez de la clave ni los créditos: la prueba de voz verifica el servicio real. Los tests del repositorio usan respuestas simuladas y no consumen créditos.

## Personalización y reproducción

Velocidad (0.7–1.2), estabilidad y fidelidad a la voz se guardan por usuario. La voz adaptativa ajusta velocidad y estabilidad según personalidad y explicaciones con pasos/cifras. No detecta emociones. La entonación manual del navegador se conserva para ese motor; no se envía como un parámetro de ElevenLabs. El acento de ElevenLabs depende de la voz elegida; la variante de español del panel se usa para reconocimiento del micrófono.

Se leen únicamente respuestas nuevas, saludos de encendido y pruebas solicitadas. El micrófono sigue usando reconocimiento del navegador. Este cambio incorpora síntesis, no ElevenLabs Conversational AI, clonación ni escucha continua.

El servidor transmite MP3; el cliente espera el audio completo antes de reproducirlo para funcionar en navegadores móviles sin MediaSource. Si el navegador bloquea reproducción automática, aparece **Reproducir voz**, que reutiliza el audio generado sin gastar otra solicitud. Apagar, silenciar, cambiar motor o salir cancela solicitudes/reproducción y libera el audio. No se guardan archivos de audio ni se agregan al caché offline.

## Acceso y límites

`POST /api/jarvis/voice` exige una sesión verificada y rechaza usuarios anónimos de Supabase. La clave, voz y modelo proceden exclusivamente del servidor. El navegador envía texto y ajustes acotados, nunca credenciales. Las respuestas de audio y errores llevan `private, no-store`; no se registran texto, audio, claves ni respuestas privadas del proveedor.

Cada respuesta admite 4.000 caracteres. Hay una solicitud activa por usuario, dos segundos entre solicitudes y un presupuesto de 20.000 caracteres por diez minutos **por proceso**. Estos límites en memoria no se comparten entre instancias de Vercel ni sobreviven reinicios; para controlar el gasto total, configura límites de crédito en ElevenLabs. Los errores de cuota no se reintentan automáticamente.

Cada lectura envía al proveedor el texto que va a hablar. La retención del proveedor depende de tu plan/configuración de ElevenLabs; la integración no promete retención cero.

## Verificar

```powershell
npm run test:jarvis
npx tsc --noEmit
npm run build
```

Prueba una voz real con tu cuenta; apaga mientras prepara el audio para confirmar que no empieza a hablar tarde. Después prueba silenciar, navegar al CRM y una clave o voz inválidas en un entorno local. Nunca pegues claves en el chat ni en commits.

Referencias: [Streaming TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/stream), [modelos](https://elevenlabs.io/docs/overview/models), [ajustes de voz](https://elevenlabs.io/docs/api-reference/voices/settings/get).
