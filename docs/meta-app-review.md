# Revisión de la app de Meta (WhatsApp) para Zorax

Qué enviar en **Meta for Developers → Zorax → Revisar → Revisión de la app** para obtener acceso avanzado a `whatsapp_business_messaging` y `whatsapp_business_management`, y después pasar la **verificación de acceso** de proveedor de tecnología. Con eso los botones de conexión de WhatsApp funcionan para cualquier tienda, no solo para cuentas con rol en la app.

Estado al 22 de octubre de 2026: negocio verificado (Zuleima Rodriguez Chona, nombre comercial Zorax), dominio zoraxpilot.com verificado, configuración de Embedded Signup creada, app publicada. La solicitud de revisión (submission 29363426229932209) tiene completos la configuración, las descripciones, las llamadas de prueba a la API, las confirmaciones de uso permitido, el tratamiento de datos y las instrucciones para revisores; solo faltan los dos videos para pulsar «Enviar para revisión». La verificación de acceso se envió el 22 de octubre y está en revisión.

## Antes de enviar

- **Configuración de la app → Básica**: URL de la política de privacidad `https://zoraxpilot.com/privacidad`; URL de eliminación de datos de usuarios `https://zoraxpilot.com/privacidad#eliminar-datos`; correo de contacto; categoría «Empresa y páginas»; icono 1024×1024 (el logotipo Z sobre fondo oscuro); dominios de la app `zoraxpilot.com`.
- **Acceso del revisor**: no se entregan credenciales. El revisor crea una cuenta gratis en `https://zoraxpilot.com/signup` con correo o con Google; la prueba gratis no pide pago ni código. Nunca se comparte la cuenta personal del dueño.
- **Videos**: uno por permiso, 30 a 90 segundos cada uno, sin cortes, con la URL visible. Formato mp4 o mov. Se graban con la Herramienta Recortes de Windows (Win+Shift+R) o con la Xbox Game Bar (Win+Alt+R).

## Por qué no sirve grabar el botón de Zorax todavía

Desde la versión 4 de Embedded Signup, Meta exige el acceso avanzado a los dos permisos para registrar cualquier número desde la ventana de conexión, aunque quien conecta tenga rol en la app. El intento del 22 de octubre de 2026 terminó con el error #2655111: «La app de socio no tiene los permisos avanzados de mensajes y administración de WhatsApp Business necesarios para el registro». Por eso los videos usan la alternativa que Meta acepta para la revisión: el número de prueba y el Administrador de WhatsApp.

## Video 1 · whatsapp_business_messaging

1. Abrir Meta for Developers → Zorax → WhatsApp → Configuración de la API.
2. Elegir como remitente el número de prueba (+1 555 629 0862) y como destinatario el celular registrado como destinatario de prueba.
3. Pulsar «Enviar mensaje» y mostrar la respuesta correcta de la API.
4. Mostrar el mensaje recibido en WhatsApp (WhatsApp Web o el celular frente a la cámara).

## Video 2 · whatsapp_business_management

1. Abrir el Administrador de WhatsApp → Plantillas de mensajes → Crear plantilla.
2. Crear una plantilla de categoría Utilidad, por ejemplo `confirmacion_pedido`: «Hola {{1}}, tu pedido {{2}} quedó confirmado. Te avisamos cuando salga.»
3. Enviarla y mostrarla en la lista con su estado.

## Video opcional · el uso real en Zorax

Con el número de prueba conectado por la conexión manual de `/dashboard/whatsapp`, escribir desde el celular de prueba y mostrar en Conversaciones el mensaje y la respuesta de Zorax, y el traspaso a una persona. Refuerza el caso de uso, pero no es obligatorio.

## Guion para después de la aprobación (video de la conexión en un clic)

1. Abrir `https://zoraxpilot.com/login`, entrar con la cuenta de prueba. Se ve el centro de mando de Zorax.
2. Ir a **WhatsApp** en el menú. Se ven los botones **Conectar mi app de WhatsApp Business** y **Conectar un número nuevo**.
3. Pulsar uno de los dos. Se abre la ventana de Meta: entrar con Facebook, elegir el portafolio, elegir o crear la cuenta de WhatsApp Business, agregar el número y verificarlo por SMS. Terminar.
4. De vuelta en Zorax, mostrar el aviso «Listo: +57 … quedó conectado» y el estado «Credenciales verificadas». Esto demuestra `whatsapp_business_management`: la app leyó el número de la cuenta, lo registró y suscribió los webhooks sin que el dueño pegara IDs ni tokens.
5. Desde otro teléfono, escribir al número conectado un mensaje de cliente, por ejemplo «Hola, ¿tienen tenis blancos talla 38?». Mostrar en Zorax, en **Conversaciones**, que el mensaje llegó y que el agente respondió con productos del catálogo. Esto demuestra `whatsapp_business_messaging`.
6. Mostrar en Conversaciones que una persona del equipo puede tomar la conversación (handoff) y responder a mano.
7. Cerrar mostrando `https://zoraxpilot.com/privacidad#eliminar-datos`.

## Textos para el formulario

Meta revisa en inglés con más rapidez; se incluye cada texto en los dos idiomas. Pegar el bloque en inglés en el formulario y, si el campo admite más texto, añadir el español debajo.

### Descripción de la app (campo «Explica el propósito de la app»)

**EN** — Zorax is a sales assistant and CRM for small retail stores in Colombia that sell through WhatsApp. A store owner creates an account at zoraxpilot.com, connects the store's own WhatsApp Business number through Embedded Signup, and from then on Zorax answers customer questions about products, sizes, colors, stock and prices from the store's catalog, prepares orders, sends the store's payment link or transfer details, and hands the conversation to a human when the customer asks for one. The store team reads and answers every conversation from the CRM. Zorax never messages customers who have not written to the business first, and it does not use message templates.

**ES** — Zorax es un asistente de ventas y CRM para tiendas pequeñas de Colombia que venden por WhatsApp. El dueño crea su cuenta en zoraxpilot.com, conecta el número de WhatsApp Business de su tienda con Embedded Signup y, desde ese momento, Zorax responde las preguntas de sus clientes sobre productos, tallas, colores, stock y precios según el catálogo, prepara pedidos, envía el enlace de pago o los datos de transferencia y cede la conversación a una persona cuando el cliente lo pide. El equipo lee y responde todas las conversaciones desde el CRM. Zorax nunca escribe a clientes que no hayan escrito primero y no usa plantillas de mensajes.

### whatsapp_business_messaging

**EN** — Zorax uses whatsapp_business_messaging to receive, through webhooks, the messages that a store's customers send to the store's own WhatsApp Business number, and to reply on the store's behalf within the 24-hour customer service window: answers about products, prices and stock from the store's catalog, order summaries, payment instructions, and notices when a person from the store takes over the chat. Zorax only replies inside conversations that the customer started; it does not send unsolicited messages and does not use message templates. Each store connects its own number; Zorax keeps one access token per store, encrypted, and acts only on that number. The store team can read and answer every conversation from the Zorax CRM. The screen recording shows a message sent through the WhatsApp Cloud API from the app's test number to a test recipient, the same call Zorax makes when it replies to a customer.

**ES** — Zorax usa whatsapp_business_messaging para recibir por webhooks los mensajes que los clientes envían al número de WhatsApp Business de cada tienda y para responder en nombre de la tienda dentro de la ventana de atención de 24 horas: respuestas sobre productos según el catálogo, resúmenes de pedido, instrucciones de pago y avisos de entrega a una persona. Zorax solo responde dentro de conversaciones que inició el cliente; no envía mensajes no solicitados ni usa plantillas. Cada tienda conecta su propio número por Embedded Signup; Zorax guarda un token por tienda, cifrado, y solo actúa sobre ese número.

### whatsapp_business_management

**EN** — Zorax uses whatsapp_business_management to finish connecting a store's own WhatsApp number without manual steps. After Embedded Signup, it reads the phone numbers of the WhatsApp Business Account that the store owner shared, confirms the number the owner chose, registers it on the Cloud API with a two-step verification PIN (skipped for numbers that keep the WhatsApp Business app), and subscribes the Zorax app to that account's webhooks so the store's incoming messages reach its CRM. It also reads the number's display name and status to show the owner whether the connection is working. Zorax only accesses the accounts that each store shares with it, and only to run that store's service. Because the connection flow cannot register numbers until advanced access is granted, the screen recording shows managing the app's test WhatsApp Business Account in WhatsApp Manager.

**ES** — Zorax usa whatsapp_business_management justo después de Embedded Signup para terminar la conexión sin pasos manuales: lista los números de la cuenta de WhatsApp Business que el dueño compartió, confirma el número elegido, lo registra en la Cloud API con un PIN de verificación en dos pasos y suscribe la app de Zorax a los webhooks de la cuenta. Después lee el estado y la calificación de calidad del número para mostrarlos en el CRM y avisar al dueño cuando algo requiera atención.

### Instrucciones para el revisor (enviadas)

Sitio para la revisión: `https://zoraxpilot.com/`. «Is Facebook Login integrated on this platform?»: Sí, porque la ventana de Embedded Signup es el inicio de sesión de Facebook.

> Zorax is a web app (interface in Spanish) at https://zoraxpilot.com. 1) Create a free account at https://zoraxpilot.com/signup with any email or with Google; the free trial needs no payment or code. 2) After the short welcome setup you land in the Zorax CRM. 3) Open "WhatsApp" in the left menu: the buttons "Conectar mi app de WhatsApp Business" and "Conectar un número nuevo" launch Embedded Signup, which is where a store shares its WhatsApp Business account with Zorax. Registering a number there requires the advanced access requested here, so the WhatsApp usage itself is shown in the screen recordings attached to each permission (Cloud API message sent from the app's test number; WhatsApp Business Account managed in WhatsApp Manager). 4) "Conversaciones" in the left menu is where the store team reads and answers the WhatsApp conversations that Zorax handles. Contact: [correo de contacto de la app].

Sin credenciales de prueba: el revisor crea su propia cuenta gratis. Los campos opcionales de códigos de acceso, restricciones geográficas y documentación complementaria quedaron vacíos.

## Uso permitido (enviado)

Las llamadas de prueba a la API de los dos permisos de WhatsApp figuran como «Completado». Están marcadas las confirmaciones «Si se aprueba, confirmo que cualquier información que reciba a través de … se usará de acuerdo con el uso permitido» de `whatsapp_business_messaging`, `whatsapp_business_management` y `public_profile`. En los dos permisos de WhatsApp solo falta subir el video.

## Tratamiento de datos (respuestas enviadas)

- ¿Hay encargados del tratamiento con acceso a datos de la plataforma?: Sí. Supabase (base de datos), Vercel (alojamiento), Groq (modelo de lenguaje que genera las respuestas), OpenAI (transcripción de notas de voz) y ElevenLabs (voz de Zorax), todos con la categoría «Soluciones y servicios de TI, incluido el almacenamiento en la nube y el procesamiento» y país Estados Unidos de América.
- Responsable de los datos: «Zuleima Rodriguez Chona (nombre comercial: Zorax)», Colombia.
- Datos entregados a autoridades por seguridad nacional en los últimos 12 meses: «No.»
- Políticas ante solicitudes de autoridades: «Revisión obligatoria de la legalidad de estas solicitudes».

## Verificación de acceso (enviada el 22 de octubre de 2026)

Meta la pide para confirmar que el negocio es un proveedor de tecnología; la fecha límite para evitar restricciones en la app es el 21 de diciembre de 2026. Respuestas enviadas:

- Tipo de negocio: «Plataforma SaaS».
- Uso de los datos de la plataforma: «Zorax es una plataforma SaaS para tiendas pequeñas de Colombia que venden por WhatsApp. Cada tienda conecta su propio número de WhatsApp Business a Zorax. Con los datos de la plataforma (los mensajes que los clientes envían a ese número y la información de la cuenta de WhatsApp Business de la tienda), Zorax responde en nombre de la tienda las preguntas sobre productos, precios y existencias según su catálogo, prepara los pedidos, envía el enlace de pago y avisa al equipo cuando un cliente pide hablar con una persona. El equipo de la tienda lee y responde todas las conversaciones desde el CRM de Zorax. Los datos solo se usan para prestar este servicio a la tienda dueña del número; no se venden ni se usan para publicidad.»
- ¿Administra varios portafolios comerciales?: No.
- Sitio web: `www.zoraxpilot.com`, que redirige a `https://zoraxpilot.com`.

Estado: en revisión; Meta escribe en un plazo de cinco días si necesita más información. El portafolio comercial todavía se llama NEXO en Meta; si preguntan, el nombre legal verificado es Zuleima Rodriguez Chona y Zorax es el nombre comercial. Si piden un documento, el RUT vigente.
