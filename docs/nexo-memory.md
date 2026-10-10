# Memoria de NEXO: estado y siguientes pasos

La memoria debe seguir al negocio y al cliente cuando la IA cede la atención a una persona. Cambiar de voz, modelo o canal no debe crear otra identidad de cliente ni perder el hilo.

## Lo que ya existe

- **Conversación:** los mensajes se guardan en `messages`, ligados al negocio, cliente y conversación. El agente comercial carga los últimos 20 mensajes en cada turno. Persistir todo el historial no significa que el modelo reciba todo el historial.
- **Gestión humana:** durante un handoff, los mensajes nuevos reutilizan el hilo `handoff` en lugar de crear otro `open`. Se guardan para que la persona continúe y no se inicia un nuevo turno automático en ese estado.
- **Personalización:** NEXO mantiene sus preferencias personales separadas de las reglas del agente comercial y del conocimiento compartido del negocio. Un adjunto personal no se comparte automáticamente con otros miembros.
- **Conocimiento:** existen fuentes y fragmentos vectoriales por negocio con RLS, revisiones y referencias, y una utilidad de recuperación autenticada. La base todavía está vacía y **el agente aún no la usa para responder**. Detalles en [nexo-rag-foundation.md](nexo-rag-foundation.md).
- **Estado operativo:** productos, precios, stock y pedidos se consultan mediante herramientas del CRM. No se sustituyen por recuerdos del modelo.
- **Hechos revisados y tareas:** `/dashboard/workspace` permite confirmar, corregir y borrar recuerdos del negocio o cliente; NEXO los recupera entre sesiones mediante Seguimiento. Los handoffs muestran ese contexto. También conserva tareas con fecha, responsable y avisos internos durables. Consulta [memoria y tareas](nexo-memory-tasks.md). No se envían automáticamente al agente externo de WhatsApp.

## Lo siguiente

1. Ingesta desde el CRM: comprobar dueño/permisos y cuota, extraer texto, fragmentar, generar embeddings y publicar una revisión completa. Mostrar origen y estado de cada documento; permitir retirarlo.
2. Recuperación en cada turno: buscar solo en el negocio verificado y registrar las fuentes usadas. WhatsApp necesita un adaptador específico de servidor porque no trae una sesión de usuario; no se debe habilitar una búsqueda administrativa arbitraria por `tenant_id` enviado por el cliente o elegido por el modelo.
3. Resumen incremental por conversación: los hechos revisados ya se conservan con procedencia, fecha, corrección y borrado. Falta extraer resúmenes automáticos del historial.
4. Ampliar contexto humano: ya recibe recuerdos y tareas activos junto al hilo y resumen del handoff. Faltan fuentes RAG, resúmenes incrementales y evaluación con conversaciones largas.

Los mensajes y documentos de clientes son datos, no instrucciones para ampliar permisos o revelar otros negocios. Ninguna memoria debe autorizar descuentos, cobros o confirmaciones fuera de las reglas del CRM. La protección frente a turnos ya en curso al tomar un handoff necesita pruebas de concurrencia adicionales; el cambio actual corrige la selección del hilo en recepción.
