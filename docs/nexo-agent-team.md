# NEXO coordina agentes especializados

NEXO es el interlocutor del dueño. En lugar de ejecutar todas las consultas con un único prompt, encarga tareas a especialistas, recibe resultados con evidencia y reúne una respuesta. Este handoff entre agentes es distinto de la transferencia de un chat de WhatsApp a una persona, que conserva su flujo existente.

## Equipo disponible

| Agente | Herramientas reales | Alcance |
| --- | --- | --- |
| Clientes | `search_customers` | Identificar clientes y devolver IDs y coincidencias. |
| Pedidos | `list_orders`, `prepare_order_proposal` | Consultar órdenes y preparar borradores que requieren confirmación humana. |
| Catálogo e inventario | `search_catalog`, `check_stock` | Consultar productos, variantes, precio y stock. |
| Análisis del negocio | `get_business_overview` | Consultar indicadores y sus ventanas de fechas. |
| Archivos | `read_attachment`, `calculate_sheet_column` | Leer adjuntos autorizados y calcular columnas con referencias. |

Cada especialista hace sus propias llamadas al modelo y solo recibe sus herramientas. NEXO dispone de `delegate_to_agent`, con un agente y una tarea. No son respuestas prefijadas ni etiquetas sobre la misma llamada. Clientes → Pedidos, por ejemplo, son ejecuciones distintas: el resultado del primer agente aporta un ID verificable al segundo. Los agentes pueden usar el mismo modelo; especialización no exige cinco proveedores o claves diferentes.

El servidor habilita especialistas a partir de las herramientas autorizadas. La membresía y el negocio los resuelve `/api/chat`; ni el modelo ni el navegador pueden ampliarlos. Sin membresía no hay agentes CRM. Archivos puede funcionar sin negocio, pero solo con adjuntos autorizados de la conversación. Los especialistas no pueden llamar a otros agentes ni a herramientas de otra especialidad. Solo Pedidos puede preparar propuestas; no dispone de una herramienta para confirmarlas.

## Resultado y límites

Un handoff devuelve ID, agente, estado (`completed`, `partial`, `failed`), resumen y evidencia de herramientas. Sin una consulta exitosa no se acepta una afirmación del modelo como resultado verificado. Los resultados vacíos válidos sí son evidencia; no implican un fallo. Los errores posteriores a una consulta conservan sus resultados como parciales. NEXO recibe avisos, conteos, referencias y límites de listas para no presentar una muestra como el total.

Límites compartidos por turno: 12 llamadas al modelo contando NEXO y especialistas, 12 herramientas de consulta, 4 handoffs y hasta 3 rondas por especialista. Siempre se reserva una llamada para la respuesta final de NEXO. El plazo total sigue siendo 55 segundos y la cancelación alcanza al equipo. Un límite o fallo no autoriza afirmar que se realizó una acción pendiente.

Cada llamada usa el medidor existente. Los tokens de los especialistas se suman a los de NEXO y se guardan también si el turno termina con error. La traza persistida en `jarvis_messages.metadata.handoffs` contiene nombres, estados, herramientas, rondas y latencia; no copia los registros completos del CRM ni los documentos. La evidencia detallada solo vive durante ese turno. El contexto de evidencia previa está limitado a 16.000 caracteres; un extracto insuficiente debe tratarse como información pendiente.

La web y la burbuja de escritorio muestran `Consultando al agente de …` durante la delegación. La voz solo recibe la respuesta de NEXO: no reproduce los borradores ni las conversaciones internas de los especialistas.

Esta entrega permite consultas y propuestas de pedidos minoristas. No confirma pagos, envía mensajes, gestiona calendarios ni ejecuta tareas durables al cerrar la sesión. Tampoco conecta Odoo ni reemplaza el motor vendedor de WhatsApp.

## Propuesta → revisión → decisión

Pedidos recibe cliente, SKUs y cantidades; la base de datos fija precios y valida pertenencia, productos activos y disponibilidad. La propuesta vence en 15 minutos, admite hasta 10 variantes y no reserva stock. Se muestra en la web y la burbuja, y se recupera desde la base de datos al recargar. NEXO no puede confirmarla por voz ni mediante una herramienta: una persona debe pulsar un botón.

`POST /api/jarvis/order-proposals` exige mismo origen, sesión real y un cuerpo estricto. La identidad proviene de `auth.getUser()`. La función SQL solo admite ejecución con service_role; comprueba autor, sesión y membresía owner/agent de nuevo. La transacción bloquea la propuesta y los productos, vuelve a validar precio y stock y crea un pedido **draft**, con pago pendiente y envío sin asignar, sus líneas y reservas de inventario. Un fallo revierte todos los cambios. Los reintentos sobre la misma propuesta devuelven el mismo pedido. La confirmación no cobra, envía ni marca la venta como pagada. Completar envío/pago sigue siendo tarea del CRM.

Cancelar termina la propuesta. Pasar a atención humana crea un caso con cliente, productos y total, asignado a quien pulsó el botón, sin pedido ni reserva de stock. Las decisiones compiten sobre la misma fila: solo una puede ejecutarse. Las propuestas se consultan con RLS y no admiten escrituras desde el navegador. No incluyen claves ni valores de configuración.

## Comprobación

- `npm run test:agent`: coordinación, secuencias, aislamiento de herramientas, permisos, fallos, cancelación, consumo y límites con proveedor simulado.
- `node --test tools/files/executor.test.mjs`: delegación de cálculos y aislamiento de archivos.
- `npm run test:team:live`: prueba opcional con el proveedor configurado y datos sintéticos. Consume tokens y usa el medidor del cupo compartido de demostración. Guarda la conversación en memoria, no consulta registros reales ni envía WhatsApp. No imprime claves, prompts, respuestas ni datos privados. Comprueba Clientes → Pedidos → respuesta final usando el ejecutor real y herramientas de prueba.
- TypeScript, ESLint y build de producción comprueban la integración.

Verificación del 9 de octubre de 2026: 159 pruebas de agentes, archivos, voz y créditos aprobadas; TypeScript, ESLint y build aprobados. La prueba con el proveedor real completó Clientes → Pedidos → respuesta final con datos sintéticos: 7 llamadas al modelo, 5.403 tokens de entrada, 400 de salida y 17,4 segundos. Es una medición de ese caso, no una garantía de latencia. Delegar implica llamadas adicionales y mayor consumo que una respuesta directa.

La coordinación no necesita nuevas variables. Las propuestas requieren aplicar `supabase/migrations/20261009135003_nexo_order_proposals.sql` antes del despliegue. `node --test tools/agent/order-actions.test.mjs tools/agent/order-proposals-sql.test.mjs` verifica autenticación, aislamiento, precios, stock, reversión, reintentos, vencimiento y atención humana.
