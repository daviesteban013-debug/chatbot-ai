# Jarvis: CRM primero, agenda después

Revisión del 7 de octubre de 2026. El objetivo es que Jarvis consulte y opere el negocio con resultados verificables, y después gestione tareas y agenda. La voz de ElevenLabs es independiente del modelo que interpreta las solicitudes.

## Motor de lenguaje

La configuración actual usa **Groq**. Los registros recientes de `agent_runs` de WhatsApp muestran `openai/gpt-oss-120b`: cuatro ejecuciones en siete días, una con error y una latencia media de aproximadamente 5,9 segundos. Es una muestra demasiado pequeña para comparar calidad o fiabilidad; tampoco mide la experiencia web.

Groq sigue siendo la base mientras falta la clave de OpenAI. Ahora el backend está preparado para seleccionar **GPT-6 Luna** al guardar `OPENAI_API_KEY`, conservando herramientas y medición de tokens. Consulta [la guía de activación](jarvis-openai.md). Cambiar de modelo no conecta automáticamente clientes, pedidos o agenda: el servidor ejecuta las herramientas y valida sus permisos. [Documentación de herramientas de Groq](https://console.groq.com/docs/tool-use/overview).

Si las evaluaciones muestran dificultades con consultas del CRM, probar **GPT-6 Luna** como candidato para tareas frecuentes. Para flujos más complejos, evaluar **GPT-6.1 Sol**. Antes de adoptar cualquiera, medir exactitud, latencia, tokens y coste en los mismos casos. No se cambiaron claves, proveedor ni modelo en esta revisión.

El cliente actual usa Chat Completions. GPT-6 Luna admite function calling allí solamente con `reasoning_effort=none`; para usar razonamiento con herramientas se necesita Responses. GPT-6.1 Sol necesita Responses para tool calling. Una migración requiere un adaptador y pruebas de consumo, no solamente cambiar `LLM_MODEL`. Fuentes: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [function calling](https://developers.openai.com/api/docs/guides/function-calling), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

## Primera fase implementada

| Herramienta web | Resultado |
| --- | --- |
| `search_customers` | Clientes por nombre, teléfono o ciudad; ID para consultar pedidos. |
| `list_orders` | Pedidos por cliente, estado o periodo; cuenta exacta y aviso de lista limitada. |
| `get_business_overview` | Clientes, productos activos, pedidos recientes y pendientes. Ventana móvil con fechas explícitas. |
| `search_catalog` | Productos y variantes del negocio. |
| `check_stock` | Disponibilidad exacta de una variante y precio minorista en COP. |

Ejemplos: «Busca a Ana y muéstrame sus pedidos pendientes», «¿Cuánto stock queda del SKU …?» y «Dame el resumen de los últimos siete días». Los pedidos pendientes no se presentan como ventas cobradas. Los periodos móviles no se presentan como días de calendario.

La ruta `/api/chat` obtiene negocio y rol de `tenant_members`; ignora un rol enviado por el navegador. Owner, agent y viewer tienen consultas de lectura. Invitados y usuarios sin membresía no reciben herramientas del CRM. Cada consulta filtra el negocio en el servidor; argumentos con permisos o negocio arbitrarios se rechazan. Los datos de registros y archivos no conceden permisos.

El ejecutor permite hasta seis llamadas al modelo y doce herramientas por turno; la última llamada sintetiza sin herramientas. Un plazo de 55 segundos y la cancelación del cliente interrumpen las consultas. Cada llamada sigue consumiendo tokens mediante el medidor existente. Se guarda una traza de nombres y estados de herramientas, sin copiar todo el contenido de los clientes a los metadatos.

Las respuestas que pueden contener llamadas a herramientas se retienen hasta saber si son finales. Las frases provisionales no se leen en voz alta ni se mezclan con el resultado confirmado. Esto puede aumentar el tiempo hasta el primer texto en respuestas sin herramientas; medirlo antes de ampliar los flujos de voz.

## Problemas corregidos

- La web exponía herramientas de WhatsApp que necesitan un cliente y una conversación reales. Antes usaba el usuario de Auth y la sesión Jarvis como esos IDs: crear pedidos o derivar conversaciones podía fallar por claves foráneas. Las herramientas de escritura de WhatsApp ya no son accesibles desde Jarvis web, aunque el modelo invente su nombre.
- La web no conservaba el rol del miembro. Ahora los permisos llegan desde la base de datos y se verifican también al ejecutar la herramienta.
- La web solo permitía una ronda de herramientas, impidiendo resolver cliente → pedidos en varios pasos. Ahora mantiene los resultados durante el turno y limita el bucle.
- Repetir una pregunta borraba del contexto cualquier mensaje anterior con el mismo texto. El historial ahora se carga antes de insertar el mensaje actual.
- Los errores devueltos por Supabase al guardar mensajes se ignoraban. Ahora se informa del fallo y no se emite un evento de finalización exitosa si la respuesta no pudo guardarse. Si falla guardar el mensaje del usuario, no se llama al modelo.

## Siguiente fase del CRM

1. **Acciones propuestas y confirmadas**: registrar un cliente, preparar un pedido o actualizar un estado. Mostrar un resumen con destinatario, cambios e importes antes de confirmar. La confirmación debe estar ligada en el servidor a una propuesta concreta, expirar y no depender de un `customer_confirmed` inventado por el modelo.
2. **Permisos por acción**: viewer solo consulta; agent realiza las acciones operativas permitidas; owner administra. Revalidar la membresía antes de confirmar una acción y registrar quién la ejecutó.
3. **Pedidos y stock transaccionales**: el flujo de WhatsApp reserva y compensa stock mediante varias operaciones. Consolidar la creación y reserva en una transacción con idempotencia para impedir duplicados y reservas huérfanas en fallos o carreras.
4. **Trabajos durables de WhatsApp**: hoy se responde al webhook antes del procesamiento en `after()`. Persistir un trabajo con estados y reintentos; una fila de mensaje existente no demuestra que el agente haya terminado. No enviar mensajes externos como parte de las pruebas sin autorización.

## Agenda y tareas

Primero añadir tareas internas del CRM: negocio, cliente opcional, responsable, vencimiento UTC, zona horaria, estado, creador y registro de cambios. Jarvis debe poder proponer una tarea, confirmar su fecha y guardarla. Un trabajador programado debe recuperar tareas pendientes incluso si se cierra la web; el historial conversacional o una promesa del modelo no son un recordatorio.

Después conectar Google Calendar y correo como integraciones separadas con permisos mínimos, tokens protegidos, desconexión y trazabilidad. Tener login con Google no concede acceso al calendario; configurar SMTP para Auth no habilita automáticamente el envío de correos del agente. Los envíos necesitan la autorización correspondiente y una vista previa del destinatario y contenido.

## Pendientes de observabilidad y voz

- `LLM_PRICE_IN_PER_MTOK` y `LLM_PRICE_OUT_PER_MTOK` no están configuradas: `calculateCost` produce cero. Los créditos por tokens sí se miden; cero coste registrado no prueba que el proveedor sea gratis.
- WhatsApp STT usa el endpoint del proveedor LLM y el modelo fijo `whisper-1`; separar URL/modelo de transcripción y validar la compatibilidad antes de activar notas de voz en otro proveedor.
- Los caminos de error de WhatsApp y del ejecutor web registran cero tokens aunque haya habido llamadas previas. Mejorar la traza de ejecución sin alterar el consumo real ya registrado en el libro de créditos.
- Persistir resultados de herramientas de forma segura si se necesitan como contexto verificable entre turnos. Por ahora se guardan estados resumidos; los datos actuales se vuelven a consultar.

## Comprobación

`npm run test:agent` cubre permisos, filtros de negocio, entradas inválidas, consultas encadenadas, límites, cancelación, tokens y persistencia. `npm run test:agent:live` comprueba las cinco consultas con la base real usando un contexto del servidor; no llama al LLM, no escribe datos ni prueba el login del navegador. No imprime registros del CRM ni claves.

Verificación de esta revisión: **129 pruebas aprobadas** en las suites de agente, archivos, Jarvis y créditos; TypeScript, ESLint y build de producción aprobados. Las cinco herramientas pasaron la comprobación con Supabase real. Estos cambios siguen locales: la publicación y una conversación real de voz con el modelo son comprobaciones separadas.
