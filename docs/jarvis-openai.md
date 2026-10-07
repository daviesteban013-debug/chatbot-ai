# Activar GPT-6 Luna en NEXO

En `.env.local`, guarda una clave de la API de OpenAI en `OPENAI_API_KEY`. Es una variable privada del servidor: no uses `NEXT_PUBLIC_` ni pegues la clave en el chat. Reinicia `npm run dev` después de guardarla.

No necesitas cambiar modelo, endpoint ni las variables de Groq. Una clave OpenAI no vacía selecciona `gpt-6-luna` y `https://api.openai.com/v1` en el servidor, tanto en NEXO web como en el bucle de WhatsApp. Ignora modelos antiguos configurados en el negocio o en `LLM_MODEL`. Sin esa clave, conserva el proveedor compatible configurado con `LLM_*`. La voz de ElevenLabs sigue siendo independiente.

Comprueba la selección local con `npm run llm:status`. Muestra proveedor, modelo, nombre de variable y presencia de clave; `ready: true` indica configuración local, no valida permisos, saldo ni disponibilidad del modelo. Una conversación real requiere la cuenta API habilitada y crédito.

## Herramientas y consumo

Se usa Chat Completions con `reasoning_effort: none`, que permite las herramientas de GPT-6 Luna, y `max_completion_tokens`, limitado por la reserva de créditos. El streaming solicita consumo real; cada ronda se liquida una sola vez con los tokens informados por el proveedor. Si la respuesta se interrumpe sin consumo confirmado, la reserva queda pendiente de revisión.

Los errores 401 y 429 informan de clave o cuota sin mostrar el cuerpo de error del proveedor. Si OpenAI falla no se cambia automáticamente a Groq. El medidor de créditos sigue contando tokens; los campos monetarios de `calculateCost` siguen dependiendo de `LLM_PRICE_IN_PER_MTOK` y `LLM_PRICE_OUT_PER_MTOK`, por lo que deben configurarse por separado para estimaciones de dinero. No son la factura real de OpenAI y no descuentan caché.

Referencias: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

## Vercel Production

La configuración local no modifica un despliegue existente. Con la sincronización habilitada, `node tools/mcp/env-cli.mjs sync` copia la nueva variable únicamente a Production. Después hace falta un despliegue nuevo para aplicarla. Respeta una sincronización pausada.

Para volver al proveedor anterior en producción, elimina `OPENAI_API_KEY` también en Vercel y despliega de nuevo: quitarla o vaciarla localmente no borra la variable remota en el sincronizador.

## Verificación sin clave real

`npm run test:credits` incluye solicitudes simuladas a OpenAI con herramientas, streaming, límites y errores. No contacta proveedores ni envía WhatsApp. TypeScript y la build verifican la integración del servidor.

Verificación del 7 de octubre de 2026: 150 pruebas aprobadas en agente, créditos, archivos, voz, PWA y Stripe. La clave real permite acceder a `gpt-6-luna`; una prueba breve con datos sintéticos verificó una llamada a herramienta, su respuesta posterior en streaming y el consumo informado por OpenAI. No consultó clientes ni envió mensajes de WhatsApp. Esto no sustituye una conversación completa del CRM con una cuenta autenticada.
