# Ventas autónomas por WhatsApp

El vendedor de WhatsApp resuelve catálogo, stock, cotización, envío y confirmación del pedido por el mismo canal. En modo `autonomous`, una duda, falta de stock, negociación o importe alto no crea un handoff. El límite anterior `auto_confirm_max_total` ya no manda las ventas autónomas a aprobación de un asesor. El cliente conserva la decisión de aceptar la compra; no se cobra ni despacha por afirmar que está hecho.

Los negocios nuevos se crean en modo autónomo. Se conservan los modos pausados, shadow y copilot existentes. El agente activo encontrado antes de esta entrega ya era autónomo: lo frenaban el prompt y el umbral de confirmación. Shadow sigue simulando y copilot conserva revisión del texto. Esta entrega no cambia las confirmaciones de memoria, tareas y propuestas internas del CRM.

## Cobros del negocio

El dueño configura en `/dashboard/agent`:

- Un enlace HTTPS reutilizable de su negocio que permita indicar el importe del pedido.
- Instrucciones públicas para transferencia: banco/billetera, titular, tipo y número de cuenta.

Solo se ofrecen los métodos configurados. No hay valores inventados ni fallback al cobro de los planes de NEXO. El formulario no solicita contraseñas ni claves API. Los miembros consultan la configuración; solo el dueño actual puede guardarla mediante un RPC privado que vuelve a comprobar su membresía.

El enlace se guarda, no se genera un checkout individual con importe ni referencia automáticamente. Se envían el total y la referencia para que el cliente los indique. Transferencia y enlace permanecen `payment_status=pending`. Recibir una captura o un «ya pagué» no confirma el pago. Para verificarlo automáticamente falta conectar el proveedor de cobro o la conciliación bancaria de cada negocio, validar su webhook y relacionarlo con el pedido; esta entrega no implementa ese conector. Tampoco contrata una transportadora ni crea una guía.

## Resumen y aceptación

1. `get_payment_options` y `get_sale_state` consultan el negocio y la conversación autorizados por el servidor.
2. `nexo_create_whatsapp_order` bloquea la conversación, calcula precios con los productos activos, agrupa SKUs, reserva stock y crea líneas en una transacción. Un fallo revierte todo; un reintento devuelve el borrador existente.
3. `save_shipping_details` valida el destino y recalcula el envío y el total. `cancel_draft_order` permite corregir productos cancelando el borrador y liberando su stock una sola vez. No cancela pedidos ya confirmados.
4. `prepare_order_confirmation` genera un resumen determinista con productos, cantidades, precios, envío, total, destinatario, dirección y medio de pago. Termina el turno: no puede encadenar una confirmación en el mismo mensaje.
5. Solo después de que Meta acepte el envío y se guarde el mensaje saliente se conserva su snapshot en `messages.raw`. Un envío fallido no deja evidencia de resumen válido.
6. Un nuevo mensaje del cliente debe aceptar expresamente ese último resumen. `nexo_confirm_whatsapp_order` valida en SQL el negocio, cliente, conversación abierta, modo vigente, mensaje entrante actual, orden temporal y coincidencia exacta del snapshot. No confía en `customer_confirmed` ni en una cita inventada por el modelo.
7. Si cambian las líneas, dirección, importes o destino de pago, se exige un resumen nuevo. Se aceptan frases breves como «sí, confirmo», «acepto», «de acuerdo» o «dale». Una pregunta, negación, modificación o aceptación ambigua pide aclaración. Las transcripciones de audio siguen la misma validación cuando el STT está conectado.
8. El pedido pasa de `draft` a `pending_payment`, conserva el pago pendiente y recibe un acuse determinista con las instrucciones de cobro del negocio. No pasa a `pending_approval`. Repetir la misma aceptación no duplica el pedido ni cambia el destino aceptado.

## Recuperación y límites

### Memoria comercial del cliente

`get_customer_context` recupera automáticamente al comienzo del turno hasta cinco preferencias y cinco compras pagadas/completadas de ese cliente en ese negocio, incluso en otra conversación. No incorpora notas privadas del CRM, direcciones ni citas originales al modelo. Los precios y el stock siempre se vuelven a consultar.

`remember_customer_preference` guarda declaraciones explícitas de color, talla, categoría del catálogo, formato texto/audio e idioma. SQL exige una frase completa y literal del último mensaje entrante real (o su transcripción), reciente y del cliente correcto; rechaza inferencias, instrucciones y secretos. Por ahora reconoce frases españolas acotadas como «Prefiero el color negro», «Mi talla es M» o «Prefiero mensajes de audio». Una preferencia de audio no habilita por sí sola el envío de notas de voz. Cada categoría reemplaza su valor anterior. `forget_customer_preference` deja de usar la preferencia cuando el cliente pide olvidarla; conserva evidencia interna recuperable, no equivale a una eliminación definitiva de datos. Shadow y copilot no escriben preferencias.

### Recordatorios de pago

El dueño puede activar en Agente uno o dos recordatorios, separados por 30–720 minutos. Están desactivados por defecto y se aplican a pedidos aceptados después de la activación, con su acuse de confirmación guardado. No se contactan pedidos antiguos al activar la opción. El historial de Agente y de la conversación muestra acciones, recordatorios, cancelaciones y fallos; owner/agent pueden cancelar los pendientes.

Supabase Cron revisa cada cinco minutos una cola durable. El worker de `/api/whatsapp/followups` recibe tickets de un solo uso, con caducidad de dos minutos y solo su hash persistido. No requiere otra clave de entorno. Antes de enviar comprueba tenant activo, modo autónomo, conversación abierta sin intervención humana, pedido pendiente, condiciones de pago aceptadas, cliente sin nueva respuesta ni solicitud de dejar de recibir mensajes y ventana de servicio de menos de 24 horas (con un minuto de margen). No envía fuera de esa ventana ni utiliza plantillas aún. Una nueva respuesta o un «no me escribas más» cancela recordatorios pendientes; la baja de seguimientos persiste entre conversaciones de ese cliente y negocio.

Estos recordatorios son texto determinista: no consumen llamadas al modelo. Cada trabajo realiza un único intento a Meta. Una preparación interrumpida puede recuperarse; si comenzó el envío y su resultado es incierto, queda `unknown` para revisión, sin reenvío automático. El estado `sent` significa aceptación por Meta, no entrega al cliente ni pago verificado. No es posible asegurar atomicidad entre una transacción de Postgres y el servicio externo: una respuesta o pausa en el instante del envío podría llegar después de la última comprobación.

Un error del modelo o agotar seis rondas no deriva la venta: deja un aviso para retomar en este hilo y consultar su estado antes de reintentar. La derivación humana solo se permite si el mensaje real del cliente la solicita explícitamente; los handoffs ya tomados por una persona siguen conservando su hilo.

No existe todavía una cola durable con recuperación automática de todos los fallos después del webhook ni caducidad automática de las reservas de estos borradores. Los envíos siguen sujetos a las credenciales y reglas del canal de Meta. Hay que completar la vinculación real del número y probar recepción/respuesta antes de certificar una SIM operativa. El envío de notas de voz por WhatsApp y la memoria documental externa siguen fuera de esta entrega.

## Seguridad y verificación

Los RPCs son `SECURITY INVOKER`, `search_path=''` y solo ejecutables por `service_role`. Las nuevas tablas de memoria comercial y seguimientos tienen RLS y lecturas para miembros del negocio; los tickets del worker son privados del servidor. Se retiran escrituras directas a `agents` y `messages` para anon/authenticated: los endpoints existentes de onboarding, aprobación, webhook y handoff escriben desde el servidor. Un cliente autenticado no puede fabricar evidencia de aceptación ni cambiar los destinos de cobro saltándose al dueño.

Pruebas: `node --test tools/whatsapp/*.test.mjs` incluye SQL real en PGlite con todas las migraciones, permisos, aislamiento, stock, reversión, repetición, banco/dirección cambiados, aceptación por audio, fallos del modelo/envío y formularios. La regresión combinada de WhatsApp, agentes, créditos, voz, archivos y conocimiento pasó 306 pruebas. Comprobar también TypeScript, ESLint y build antes de publicar. Las pruebas simuladas no certifican recepción ni cobro real en Meta o un banco.
