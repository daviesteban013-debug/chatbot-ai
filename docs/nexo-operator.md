# NEXO como operador del CRM

NEXO coordina herramientas del CRM y muestra sus pasos en «NEXO en acción», tanto en la web como en la burbuja. Cada resultado procede de una consulta o de una propuesta comprobada en el servidor.

## Qué pedirle

- «Busca a Ana y revisa sus últimos pedidos y conversaciones». Si hay homónimos, debe pedir cuál es el cliente correcto.
- «Prepara otro pedido como el último de Ana». Repite productos y cantidades de un pedido minorista con variantes activas, precios actuales y stock disponible. No copia descuentos, envío, dirección ni pagos anteriores.
- «Busca las conversaciones pendientes de atención humana y abre este caso». Puede consultar handoffs y mostrar la ficha; tomar o resolver el caso sigue siendo una decisión humana.
- «Abre pedidos», «abre WhatsApp» o «muéstrame ese pedido». Los comandos sencillos abren paneles sin llamar al modelo. Para abrir un registro desde un turno de IA, el servidor comprueba su ID dentro del negocio.

Una consulta muestra un acceso «Ver…». Solo una acción explícita `open_crm_panel`, completada en el turno actual, abre automáticamente una pantalla. Restaurar el historial, leer un resultado o cancelar una respuesta nunca reproduce navegación automática. La web abre el CRM en una vista amplia que conserva NEXO; «Volver a NEXO» devuelve la conversación. En la app instalada se utiliza su ventana CRM.

## Pedidos y atención humana

Preparar una propuesta no crea pedidos ni reserva inventario. La tarjeta permite confirmar, cancelar o pasar a atención humana. Confirmar vuelve a verificar las condiciones y registra un borrador con inventario reservado, pago y envío pendientes. No se realizan cobros. Una propuesta anterior con precios distintos no se presenta como una repetición verificada: debe revisarse y cancelarse antes de preparar otra.

Las tarjetas son la fuente del estado actual de las propuestas; el panel de actividad conserva el resultado del paso que las preparó. Los pedidos mayoristas, incompletos, con más de diez líneas o sin existencias suficientes requieren revisión.

## Permisos y límites

El servidor deriva usuario, negocio y rol de la sesión y vuelve a comprobar la membresía en cada paso CRM. Cada tabla, incluidos los registros hijos, se consulta por negocio. Los roles viewer solo consultan; owner y agent pueden preparar propuestas. No se habilitan cambios de permisos, borrados, mensajes automáticos, cobros ni control general del ordenador.

Los destinos admitidos son paneles conocidos y detalles UUID de pedidos, conversaciones o handoffs. No se aceptan URLs externas ni rutas proporcionadas libremente por el modelo. Las respuestas de CRM, archivos y mensajes de clientes se tratan como datos, nunca como instrucciones o permisos.

El turno conserva los límites compartidos de llamadas al modelo y herramientas y un plazo de 55 segundos. Los listados y extractos indican sus límites. Una cancelación o desconexión marca como no confirmado el trabajo sin resultado, conserva propuestas ya preparadas e impide aperturas tardías.

Los instaladores desktop 0.2.0 admiten paneles base; cuando rechazan un detalle nuevo, la web de NEXO pide abrir la lista y explica que hay que seleccionar el registro. La política del código desktop ya admite los detalles y WhatsApp; distribuirla requiere una siguiente versión del instalador. Las mejoras web de actividad llegan al cargar NEXO.

## Verificación

`npm run test:agent`, `npm run test:jarvis`, `npm run test:files` y `node --test desktop/test/*.test.cjs` cubren aislamiento por negocio, permisos revocados, repetición con precios y stock actuales, aprobación, rollback de reservas, navegación permitida, streaming, historial y cancelación.

`npm run test:agent:live` comprueba consultas reales de solo lectura y muestra únicamente nombres de herramientas y estados. `npm run test:team:live` usa el modelo y la medición de créditos reales con CRM sintético, sin leer ni modificar registros de negocio; verifica Clientes → Pedidos → abrir el panel. Las rutas `/dev/nexo` y `/dev/nexo?experience=1` permiten revisar el diseño local y devuelven 404 en producción.
