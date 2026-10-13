# Permisos del CRM y cupo de voz

Las tablas de negocio originales conservan lecturas con RLS por negocio. Se retiran las escrituras directas del navegador para todos los roles: pedidos, líneas, catálogo, inventario, clientes, conversaciones, mensajes, handoffs, agentes, ejecuciones y evaluaciones. El servidor escribe después de comprobar la sesión, el negocio y el rol. Un lector no puede aprobar respuestas/pedidos, enviar mensajes, tomar o resolver handoffs ni alterar el historial. Dueños y agentes conservan las operaciones autorizadas de aprobación y handoff. Los RPC antiguos de stock son privados del servidor, tienen `search_path` fijo y rechazan cantidades no positivas.

La configuración compartida de NEXO (`jarvis_configs`) solo admite cambios del dueño, también mediante RLS. Las preferencias personales del usuario, como su voz/color, continúan siendo personales. Ninguno de estos cambios otorga al modelo permisos administrativos nuevos.

## Voz compartida entre servidores

Cada petición reserva cupo atómicamente en PostgreSQL antes de llamar al proveedor. No hay alternativa sin límite si la base de datos falla. El negocio se obtiene de la membresía en el servidor y el RPC vuelve a comprobarla. Los miembros de un negocio no pueden eludir su cupo usando una reserva personal. Cuentas autenticadas sin negocio utilizan su propio cupo; sesiones anónimas no acceden a los proveedores.

- Salida ElevenLabs: 20.000 caracteres cada 10 minutos por negocio/cuenta, hasta 4.000 por petición.
- Transcripción del micrófono de NEXO: un cupo independiente de 40 clips cada 10 minutos, con los límites existentes de tamaño/formato y duración declarada de cada clip. La duración declarada por el cliente no sirve para aumentar el cupo; cada petición consume una unidad fija.
- Por usuario y canal: una generación activa, hasta tres peticiones breves en ráfaga y recuperación de una petición cada dos segundos.
- Una sesión abandonada libera su bloqueo después de 60 segundos. Una respuesta tardía no puede liberar el bloqueo de otra petición nueva.
- Errores y cancelaciones no devuelven cupo temporal: el proveedor puede haber procesado trabajo. Este contador es una protección de uso, independiente del cobro de créditos/mensajes de NEXO.
- Al alcanzar el límite, HTTP 429 incluye `Retry-After` y un mensaje con el tiempo de recuperación. El chat por texto conserva su funcionamiento y su cupo habitual.

Solo se guardan identificadores, cantidades, tiempos y estados. No se guardan texto ni audio en las tablas de cupo; los registros se depuran después de siete días. Estos límites protegen cada negocio/cuenta, no constituyen un techo monetario global del proveedor ni una protección completa contra la creación masiva de cuentas. El cambio de esta entrega cubre la voz y transcripción de la app NEXO; el procesamiento de audios entrantes de WhatsApp conserva su circuito existente.

## Comprobación

`node --test tools/security/*.test.mjs tools/jarvis/*.test.mjs` verifica roles, escrituras directas, acciones del servidor, aislamiento, presupuestos compartidos, ráfagas, caducidad, resultados inciertos y recuperación. Las suites SQL aplican todas las migraciones en PGlite. Las verificaciones de producción deben usar datos sintéticos y revertirlos/eliminarlos, sin mensajes a clientes reales.
