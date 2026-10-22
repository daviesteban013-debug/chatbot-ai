# Revisión de la app de Meta (WhatsApp) para Zorax

Qué enviar en **Meta for Developers → Zorax → Revisar → Revisión de la app** para obtener acceso avanzado a `whatsapp_business_messaging` y `whatsapp_business_management`, y después pasar la **verificación de acceso** de proveedor de tecnología. Con eso los botones de conexión de WhatsApp funcionan para cualquier tienda, no solo para cuentas con rol en la app.

Estado al 22 de octubre de 2026: negocio verificado (Zuleima Rodriguez Chona, nombre comercial Zorax), dominio zoraxpilot.com verificado, configuración de Embedded Signup creada, app publicada. Pendiente: enviar la revisión con el video y las credenciales de prueba.

## Antes de enviar

- **Configuración de la app → Básica**: URL de la política de privacidad `https://zoraxpilot.com/privacidad`; URL de eliminación de datos de usuarios `https://zoraxpilot.com/privacidad#eliminar-datos`; correo de contacto; categoría «Empresa y páginas»; icono 1024×1024 (el logotipo Z sobre fondo oscuro); dominios de la app `zoraxpilot.com`.
- **Cuenta de prueba para el revisor**: un negocio de prueba en zoraxpilot.com con catálogo cargado, cuya contraseña se escribe solo en el formulario de Meta (sección «Instrucciones para la verificación»). Nunca la cuenta personal del dueño.
- **Video**: una sola grabación de pantalla, 60 a 120 segundos, sin cortes, con la URL visible. Formato mp4 o mov.

## Guion del video (en pantalla, en este orden)

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

**EN** — Zorax is a sales assistant and CRM for small retail stores in Colombia that sell through WhatsApp. A store owner creates an account at zoraxpilot.com, connects the store's own WhatsApp Business number through Embedded Signup, and from then on Zorax answers customer questions about products, sizes, colors, stock and prices from the store's catalog, prepares orders, sends the store's payment link or transfer details, and hands the conversation to a human when the customer asks for one. The store team reads and answers every conversation from the CRM. Zorax never messages customers who have not written to the business first, and it only sends template messages for order follow-ups that the owner enables.

**ES** — Zorax es un asistente de ventas y CRM para tiendas pequeñas de Colombia que venden por WhatsApp. El dueño crea su cuenta en zoraxpilot.com, conecta el número de WhatsApp Business de su tienda con Embedded Signup y, desde ese momento, Zorax responde las preguntas de sus clientes sobre productos, tallas, colores, stock y precios según el catálogo, prepara pedidos, envía el enlace de pago o los datos de transferencia y cede la conversación a una persona cuando el cliente lo pide. El equipo lee y responde todas las conversaciones desde el CRM. Zorax nunca escribe a clientes que no hayan escrito primero y solo envía plantillas de seguimiento de pedidos que el dueño activa.

### whatsapp_business_messaging

**EN** — Zorax uses whatsapp_business_messaging to receive the messages that a store's customers send to the store's own WhatsApp Business number (via webhooks) and to reply on the store's behalf inside the 24-hour customer service window: product answers from the catalog, order summaries, payment instructions and handoff notices. Template messages are used only for order follow-ups (payment reminders and delivery updates) that the store owner explicitly enables, and only to customers with an open order. Each store connects its own number through Embedded Signup; Zorax holds one business token per store, stored encrypted, and only acts on that store's number. The reviewer video shows a customer message arriving in the Zorax CRM and the automatic reply.

**ES** — Zorax usa whatsapp_business_messaging para recibir por webhooks los mensajes que los clientes envían al número de WhatsApp Business de cada tienda y para responder en nombre de la tienda dentro de la ventana de atención de 24 horas: respuestas sobre productos según el catálogo, resúmenes de pedido, instrucciones de pago y avisos de entrega a una persona. Las plantillas se usan solo para seguimientos de pedido (recordatorios de pago y actualizaciones de entrega) que el dueño activa expresamente, y solo con clientes que tienen un pedido abierto. Cada tienda conecta su propio número por Embedded Signup; Zorax guarda un token por tienda, cifrado, y solo actúa sobre ese número.

### whatsapp_business_management

**EN** — Zorax uses whatsapp_business_management right after Embedded Signup to finish the connection without manual steps: it lists the phone numbers of the WhatsApp Business Account the owner shared, confirms the number the owner chose, registers it on the Cloud API with a two-step verification PIN, and subscribes the Zorax app to the account's webhooks. Later it reads the number's status and quality rating to show them in the CRM and to tell the owner when something needs attention. It does not create or edit message templates on behalf of the business beyond the order follow-up templates the owner enables from the CRM.

**ES** — Zorax usa whatsapp_business_management justo después de Embedded Signup para terminar la conexión sin pasos manuales: lista los números de la cuenta de WhatsApp Business que el dueño compartió, confirma el número elegido, lo registra en la Cloud API con un PIN de verificación en dos pasos y suscribe la app de Zorax a los webhooks de la cuenta. Después lee el estado y la calificación de calidad del número para mostrarlos en el CRM y avisar al dueño cuando algo requiera atención.

### Instrucciones paso a paso para el revisor

**EN**
1. Go to https://zoraxpilot.com/login and sign in with the test credentials below.
2. Open "WhatsApp" in the left menu. Click "Conectar un número nuevo" (or "Conectar mi app de WhatsApp Business" to link an existing WhatsApp Business app) and complete Embedded Signup with a test WhatsApp Business Account (or watch the attached video, where this is done with a real number).
3. After the popup closes, the page shows the connected number and the status "Credenciales verificadas" (whatsapp_business_management: numbers listed, registered and webhooks subscribed).
4. From any phone, send a WhatsApp message to the connected number, e.g. "Hola, ¿tienen tenis blancos talla 38?".
5. Open "Conversaciones" in the left menu: the message appears and Zorax's reply with catalog products is shown (whatsapp_business_messaging).
6. Click "Tomar conversación" to see a human agent take over and answer manually.
7. Data deletion instructions: https://zoraxpilot.com/privacidad#eliminar-datos

**ES** — los mismos pasos en español, por si el revisor prefiere el idioma del producto.

### Credenciales de prueba

Se completan directamente en el formulario de Meta, no en este documento: correo y contraseña del negocio de prueba creado para la revisión, y el número de WhatsApp de prueba que queda conectado a ese negocio.

## Verificación de acceso (después de la revisión)

Meta pregunta por el negocio que opera la app. Respuestas: sitio web `https://zoraxpilot.com`; descripción como la del punto «Descripción de la app»; país Colombia; el negocio ya está verificado como Zuleima Rodriguez Chona con nombre comercial Zorax; política de privacidad `https://zoraxpilot.com/privacidad`. Si piden un documento, el RUT vigente del negocio.
