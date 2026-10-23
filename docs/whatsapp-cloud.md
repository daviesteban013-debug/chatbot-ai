# WhatsApp Cloud API en Zorax

El panel `/dashboard/whatsapp` permite al dueño verificar y guardar su número por negocio, registrarlo con un PIN de dos pasos y suscribir la aplicación. Los demás miembros solo consultan el estado. No se envían mensajes de prueba automáticamente.

## Conexión en un clic (Embedded Signup)

Con `WHATSAPP_APP_ID` y `WHATSAPP_SIGNUP_CONFIG_ID` configurados, el dueño ve el botón **Conectar WhatsApp con Meta**. El flujo es el de cualquier plataforma partner:

1. El navegador carga el SDK de Facebook y abre la ventana de Meta con la configuración de Embedded Signup de la app (`config_id`, `response_type: code`, `extras.version: "v5"`; desde el 15 de octubre de 2026 Meta trata como v4 cualquier apertura sin versión). El dueño entra con Facebook, elige o crea su cuenta de WhatsApp Business, agrega su número y lo verifica por SMS o llamada.
2. La ventana envía por `postMessage` el `phone_number_id` y el `waba_id`; el SDK devuelve un código de un solo uso. El navegador manda los tres a `POST /api/whatsapp/setup` con `operation: signup`. Nunca recibe un token.
3. El servidor cambia el código por el token de integración del negocio (`/oauth/access_token` con el secreto de la app), comprueba app, permisos, pertenencia y verificación del número como en la ruta manual, guarda el token cifrado, registra el número con un PIN de seis dígitos generado por Zorax (cifrado en `two_step_pin_enc`) y suscribe la app a los webhooks. El PIN se muestra una vez en pantalla.
4. Si el número ya tenía PIN de verificación en dos pasos (error 133005), queda vinculado y suscrito, y el dueño termina con su PIN en la sección manual.
5. **Conservar la app (coexistencia).** El botón «Conectar mi app de WhatsApp Business» abre el flujo v5, que ofrece vincular la app por defecto («Conectar un número nuevo» lo apaga con `features: [{ name: "whatsapp_business_app_onboarding", enabled: false }]`): el dueño escribe el número de su app y la vincula escaneando un código desde el celular. Meta registra el número para la app y la API a la vez, así que Zorax no llama a `/register` ni exige verificación por SMS; solo guarda el token y suscribe la app. Si el evento final trae solo la cuenta, Zorax toma el único número de esa cuenta. Lo que el dueño responde desde el celular llega por el campo `smb_message_echoes` (suscrito en la app desde el 23 de octubre de 2026): Zorax lo guarda en la conversación como mensaje humano y pasa el chat a atención humana tomada por el dueño, así no responde encima. Si un cliente ya esperaba asesor, ese handoff queda tomado. Si Zorax estaba preparando una respuesta cuando alguien del negocio contestó, no la envía y queda como propuesta. Para devolverle el chat a Zorax se resuelve el handoff en «Atención humana».
6. **Traer los contactos y los chats de la app.** Al vincular, Zorax pide a Meta (`POST /<phone_number_id>/smb_app_data`) primero `smb_app_state_sync` y luego `history`. Meta acepta cada pedido una sola vez y solo durante las 24 horas siguientes; si uno falla, la página de WhatsApp muestra «Traer mis chats» hasta que vence el plazo. Los contactos llegan por `smb_app_state_sync` y se guardan como clientes con el nombre que el negocio les puso, que ya no reemplaza el nombre de perfil de WhatsApp. Los chats llegan por `history`, de hasta 180 días: cada hilo queda en la conversación del cliente con la fecha original de cada mensaje, sin disparar a Zorax ni pausar el chat. `nexo_import_whatsapp_history` ignora los bloques repetidos y completa los adjuntos que Meta envía después. La página muestra el avance que reporta Meta y si el negocio decidió no compartir su historial (código 2593109). La app debe tener suscritos `history`, `smb_app_state_sync`, `smb_message_echoes` y `account_update`, además de `messages`. Los cinco están suscritos desde el 23 de octubre de 2026. La migración es `20261023120000_whatsapp_app_sync.sql`.

En la app de escritorio el botón funciona desde Zorax 0.3.1: la ventana del CRM permite abrir el diálogo de inicio de sesión de Meta en una ventana emergente aislada (solo orígenes de Meta, misma sesión, sin Node). Versiones anteriores bloquean toda ventana emergente y la página lo avisa (`nexoDesktop.metaPopups`).

Requisitos en Meta: producto **Facebook Login for Business** con una configuración de Embedded Signup para WhatsApp, `zoraxpilot.com` en los dominios permitidos del SDK de JavaScript y, para que funcione con negocios ajenos a la app, verificación de negocio de Zorax más acceso avanzado a `whatsapp_business_management` y `whatsapp_business_messaging` (Tech Provider). Antes de eso solo conecta a quienes tengan rol en la app.

## Activación con una SIM nueva

1. Crea una aplicación con WhatsApp en [Meta for Developers](https://developers.facebook.com/apps/) y vincula el portafolio empresarial que administra la cuenta de WhatsApp Business. No registres esta SIM en la aplicación móvil durante este flujo de Cloud API.
2. Agrega el número real en WhatsApp Manager y verifica su propiedad por SMS o llamada. Guarda el **Phone Number ID** y el **WhatsApp Business Account ID (WABA)**: no son el número de celular.
3. Configura en el servidor `WHATSAPP_APP_ID` y `WHATSAPP_APP_SECRET` de esa misma aplicación. Un valor presente no garantiza que sea válido. Genera los secretos locales faltantes con `npm run whatsapp:setup -- init`; conserva `WHATSAPP_CREDENTIALS_KEY` de forma segura, porque cambiarlo sin volver a cifrar hace ilegibles los tokens guardados.
4. Sincroniza solo Production con `node tools/mcp/env-cli.mjs sync`, respetando su estado habilitado o pausado. Publica un despliegue nuevo para aplicar cambios de variables. `npm run whatsapp:setup -- status` muestra nombres y estados, nunca valores.
5. En Meta configura el callback `https://zoraxpilot.com/api/whatsapp`, el Verify Token que coincide con `WHATSAPP_VERIFY_TOKEN` del servidor y el campo **messages**. Transfiere los secretos directamente entre las pantallas de configuración; no por chats o capturas.
6. Crea un token de usuario del sistema con acceso a la WABA y permisos `whatsapp_business_management` y `whatsapp_business_messaging`. Pega el token y los dos IDs en el panel. El servidor verifica la aplicación, permisos, pertenencia del número y verificación SMS antes de guardar. Un token temporal puede servir para pruebas, pero caduca.
7. Para un número aún no registrado en Cloud API, introduce un PIN de seis dígitos y usa **Registrar y suscribir aplicación**. Este PIN no es el código SMS. Si ya está registrado, usa la opción de suscripción sola. Se vuelve a verificar el token antes de actuar en Meta.
8. El producto usa **autonomous** para resolver y cerrar ventas con la aceptación del cliente. Configura enlace de cobro y transferencia en `/dashboard/agent`. Desde otro WhatsApp, escribe al número; comprueba recepción, resumen, aceptación, pedido y entrega de instrucciones. Para una prueba supervisada puedes conservar **copilot**. La derivación humana es excepcional y debe solicitarla el cliente. Consulta [ventas autónomas](whatsapp-autonomous-sales.md) para conocer las verificaciones y límites.

**Credenciales verificadas** indica que Meta validó los datos guardados. **Recepción comprobada** indica que un mensaje entrante llegó al procesador; no sustituye la prueba de respuesta, entrega y handoff. La creación de la app, sus permisos de producción y la verificación de la SIM son pasos externos pendientes hasta realizarlos con la cuenta real.

## Seguridad y despliegue

- El negocio y el usuario se resuelven desde la sesión; el cuerpo de la solicitud no puede elegirlos. Solo `owner` puede gestionar el canal y se comprueba de nuevo antes de modificarlo.
- Un número solo puede pertenecer a un negocio. El guardado bloquea el negocio y vuelve a comprobar al dueño en la base de datos.
- Los tokens nuevos se cifran con AES-256-GCM, ligados al negocio y al ID del número. El navegador no puede consultar la columna de credenciales, ni con `SELECT *`. Los errores no devuelven respuestas crudas de Meta.
- El webhook valida la firma del cuerpo usando el secreto de la aplicación. El número del canal determina el negocio. Los lectores de credenciales compartidos se usan en agente, respuestas humanas y medios.
- La versión de Graph API se centraliza en `WHATSAPP_GRAPH_VERSION`, predeterminada `v26.0`. Revisar compatibilidad antes de cambiarla.

La migración `20261009155330_whatsapp_cloud_setup.sql` ya está aplicada en Supabase. Conserva los tokens antiguos durante el despliegue porque los lectores anteriores esperan texto plano. **Solo después de publicar los nuevos lectores y la clave en todos los consumidores**, ejecuta:

```powershell
node tools/whatsapp/setup.mjs encrypt-legacy --deployed
```

El comando no imprime credenciales, solo la cantidad convertida. Los lectores mantienen compatibilidad transitoria. Un fallo de descifrado bloquea el envío y no activa un token global alternativo. El fallback local sin token guardado exige coincidencia exacta de `WHATSAPP_PHONE_NUMBER_ID`.

## Validación

`npm run test:whatsapp`: 15 pruebas sobre cifrado, aislamiento por negocio/número, contratos de Meta simulados, permisos HTTP, CSRF, datos estrictos, revocación de dueño, RLS real y continuidad del handoff. También se ejecutó la regresión del agente, Zorax, créditos, adjuntos y conocimiento: 187 pruebas aprobadas. Estas pruebas no certifican la conexión de una SIM real sin completar el paso 8.

Los asesores de Supabase no señalaron problemas nuevos en los objetos de WhatsApp. Persisten avisos anteriores en otros objetos, documentados en [la base RAG](nexo-rag-foundation.md), y la [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) de Auth sigue deshabilitada. Esto no certifica toda la seguridad del proyecto.

Referencias: [colección oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/overview), [Cloud API: registro y suscripción](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-bf13124f-2d24-4be7-b739-f7dbae2f325e).
