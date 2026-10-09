# Memoria de NEXO: estado y siguientes pasos

La memoria debe seguir al negocio y al cliente cuando la IA cede la atención a una persona. Cambiar de voz, modelo o canal no debe crear otra identidad de cliente ni perder el hilo.

## Lo que ya existe

- **Conversación:** los mensajes se guardan en `messages`, ligados al negocio, cliente y conversación. El agente comercial carga los últimos 20 mensajes en cada turno. Persistir todo el historial no significa que el modelo reciba todo el historial.
- **Gestión humana:** durante un handoff, los mensajes nuevos reutilizan el hilo `handoff` en lugar de crear otro `open`. Se guardan para que la persona continúe y no se inicia un nuevo turno automático en ese estado.
- **Personalización:** NEXO mantiene sus preferencias personales separadas de las reglas del agente comercial y del conocimiento compartido del negocio. Un adjunto personal no se comparte automáticamente con otros miembros.
- **Conocimiento:** existen fuentes y fragmentos vectoriales por negocio con RLS, revisiones y referencias, y una utilidad de recuperación autenticada. La base todavía está vacía y **el agente aún no la usa para responder**. Detalles en [nexo-rag-foundation.md](nexo-rag-foundation.md).
- **Estado operativo:** productos, precios, stock y pedidos se consultan mediante herramientas del CRM. No se sustituyen por recuerdos del modelo.

## Lo siguiente

1. Ingesta desde el CRM: comprobar dueño/permisos y cuota, extraer texto, fragmentar, generar embeddings y publicar una revisión completa. Mostrar origen y estado de cada documento; permitir retirarlo.
2. Recuperación en cada turno: buscar solo en el negocio verificado y registrar las fuentes usadas. WhatsApp necesita un adaptador específico de servidor porque no trae una sesión de usuario; no se debe habilitar una búsqueda administrativa arbitraria por `tenant_id` enviado por el cliente o elegido por el modelo.
3. Resumen incremental por conversación y hechos confirmados del cliente: separar citas del cliente, hechos comprobados y pendientes. Conservar procedencia y fecha; permitir corrección/borrado. Todavía no se implementan resúmenes automáticos ni una memoria permanente de clientes.
4. Entregar al humano el mismo contexto: intención, resumen, pedidos/propuestas, fuentes y siguiente acción. Medir la continuidad con conversaciones largas y cambios entre IA y persona.

Los mensajes y documentos de clientes son datos, no instrucciones para ampliar permisos o revelar otros negocios. Ninguna memoria debe autorizar descuentos, cobros o confirmaciones fuera de las reglas del CRM. La protección frente a turnos ya en curso al tomar un handoff necesita pruebas de concurrencia adicionales; el cambio actual corrige la selección del hilo en recepción.
