# Memoria y tareas internas de NEXO

`/dashboard/workspace` reúne tareas, memoria, propuestas por confirmar e historial. «Abre memoria», «abre tareas» o «abre recordatorios» abre esta pantalla desde NEXO.

## Memoria con revisión humana

«Recuerda que Ana prefiere entregas por la mañana» prepara un recuerdo. NEXO debe identificar al cliente sin escoger entre homónimos. Solo se vuelve recuperable al pulsar **Confirmar**. Los miembros del negocio consultan recuerdos activos; owner y agent proponen, confirman, corrigen y borran. Viewer solo consulta.

Se conservan autor, fecha, versión, cliente opcional y sesión de origen. El especialista Seguimiento usa `search_business_memory` en sesiones posteriores, con IDs, procedencia y aviso de resultados limitados. Los handoffs muestran recuerdos y tareas activos del mismo cliente.

«Recuerda sobre mí que prefiero respuestas cortas» guarda una preferencia **privada** de la cuenta. Los recuerdos antiguos de Personalización no se comparten automáticamente. Borrar un recuerdo del CRM elimina su contenido recuperable y deja auditoría sin el texto; no borra los mensajes originales de la conversación.

Los recuerdos son datos, no instrucciones ni permisos. Precios, stock y pedidos se consultan en el CRM. Las notas internas no se insertan automáticamente en el agente externo de WhatsApp. La ingesta documental RAG y los resúmenes automáticos siguen pendientes; esta fase conserva hechos revisados, sin inferir datos sensibles ni generar embeddings en cada turno.

## Tareas y avisos internos

Ejemplo: «Recuérdame revisar el pedido de Ana el 15 de octubre a las 9, hora de Bogotá». NEXO pregunta si falta hora o zona, prepara la propuesta y muestra **Revisar propuesta**. La persona comprueba cliente, responsable y fecha y pulsa Confirmar. Un «sí» en el chat no activa nada.

Se persisten el instante UTC y la zona IANA. El formulario manual usa la zona del dispositivo, indicada debajo de la fecha. El responsable por defecto es quien solicita; puede ser otro miembro del negocio. Una tarea activa admite completar, cancelar, corregir/reprogramar, reasignar y borrar. Corregir exige la versión actual para no sobrescribir cambios ajenos.

`pg_cron` ejecuta `nexo_enqueue_task_reminders()` cada minuto. Inserta avisos internos idempotentes por tarea, destinatario y vencimiento, sin navegador ni modelo. Las propuestas, tareas canceladas y completadas no generan avisos nuevos. Reprogramar permite un aviso para la nueva fecha. Cada ejecución procesa hasta 500 tareas y evita filas bloqueadas por otro trabajador.

El CRM y NEXO web muestran un contador de tareas vencidas al abrirse y cada minuto mientras están visibles. Al volver, las tareas siguen allí. **No son alarmas del ordenador, correos, WhatsApp ni Google Calendar.** Un responsable que pierde su membresía deja de recibir avisos; otro agente puede reasignar la tarea.

## Seguridad y operación

- RLS en las tres tablas nuevas y filtros explícitos de negocio. Propuestas visibles solo a su creador; recordatorios solo a su destinatario.
- RPC de servidor revalida rol y membresía dentro de la transacción. Sin escritura directa del navegador ni herramientas del modelo para confirmar/borrar.
- Cliente y responsable pertenecen al negocio. La sesión de origen pertenece al actor y negocio. No se aceptan tenant ni rol elegidos por el modelo o navegador.
- Confirmación idempotente, control de versiones y auditoría transaccional sin contenido de recuerdos.
- Propuestas de 24 horas, máximo 30 abiertas por creador/negocio. Fechas futuras dentro de dos años.
- Sin nuevas claves de entorno. Comprobar que Cron tenga activo `nexo-internal-task-reminders` y ejecuciones `succeeded`.

Desktop 0.2.1 vuelve al CRM al pedir la nueva pantalla; selecciona **Memoria y tareas** en su menú actualizado. El CRM carga los cambios web sin reinstalar. No se publicó otro instalador ni se amplió el control del sistema operativo.

## Validación

`node --test tools/agent/workspace*.test.mjs tools/agent/work-tools.test.mjs` comprueba NEXO → Seguimiento → propuesta, confirmación separada, fechas, aislamiento, revocación, revisiones, auditoría y avisos sin navegador. La comprobación SQL real usa datos sintéticos en una transacción con ROLLBACK.

Referencias: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [programación e historial de Cron](https://supabase.com/docs/guides/cron/quickstart).

Validación del 10 de octubre de 2026: 271 pruebas de agente, créditos, personalización/voz, archivos y conocimiento aprobadas; TypeScript, ESLint de los cambios y build de producción aprobados. La prueba SQL con datos sintéticos terminó en ROLLBACK y Cron registró `succeeded`. El modelo configurado recuperó un recuerdo confirmado y preparó una tarea pendiente de revisión con datos sintéticos: cinco llamadas, unos 14 segundos; no se creó ninguna tarea activa ni se enviaron mensajes externos. Los advisors no señalaron las tablas o funciones nuevas; siguen existiendo avisos anteriores del proyecto.
