# Cupos de NEXO y consumo de WhatsApp

## NEXO: mensajes con recuperación por horas

Desde `20261010131118_nexo_rolling_messages.sql`, NEXO web y escritorio usan una
ventana móvil de **3 horas**: prueba 15 mensajes, Esencial 40, Crecimiento 100 y
Equipo 200. Cada mensaje recupera su espacio 3 horas después de iniciarse; no se
reinicia todo el cupo a una hora fija. Se comparte entre miembros y sesiones de
un mismo negocio. Cuentas sin negocio tienen su propio cupo de prueba; la demo
pública comparte 20 mensajes entre todos los visitantes.

Un turno completado consume **un mensaje**, aunque consulte varios especialistas
o herramientas. No se cobra por tokens al usuario de NEXO. Guardar una preferencia
sin modelo no consume mensajes. Fallos y cancelaciones devuelven el espacio;
reservas abandonadas caducan tras 2 minutos. La respuesta fallida puede haber
consumido recursos del proveedor: su registro técnico se conserva.
La protección contra reintentos repetidos permite hasta 3 veces el cupo del plan
en intentos por ventana de 3 horas, incluyendo fallidos/cancelados. Si se alcanza,
se informa de una pausa temporal distinta del agotamiento de mensajes y su fecha
de recuperación. Esto evita consumir recursos ilimitados cancelando cada turno.

La reserva es atómica: el bloqueo del periodo del propietario serializa todas
las sesiones antes de comprobar la ventana. Cambiar de conversación, pestaña o
dispositivo no renueva el cupo. Las RPC y tablas nuevas son privadas para
`service_role`, con RLS y `SECURITY INVOKER`; la ruta deriva la identidad de la
sesión autenticada. El plan sigue exigiendo suscripción y modo Stripe verificados.

Los límites viven en `nexo_message_limits`; `NEXO_MESSAGE_LIMITS` documenta los
valores comerciales. Cambiar ambos y los textos de `lib/plans.ts` conjuntamente.
No se modifican precios ni suscripciones existentes. Las barras muestran el
porcentaje y mensajes disponibles, el negocio y la próxima recuperación en hora
de Colombia. Un cupo vacío pausa NEXO, pero no impide usar el CRM manualmente.

`nexo_model_requests` registra cada llamada y su consumo real por separado, con
liquidación idempotente. Una llamada necesita una reserva de mensaje activa y
del mismo propietario. Se permiten como máximo 12 llamadas por turno y 200.000
unidades de reserva por llamada, además del plazo de ejecución de 55 segundos.
Una respuesta aceptada sin consumo confirmado permanece pendiente para revisión,
sin inventar valores ni liberar costes desconocidos. El historial reenviado se
limita a 8 pares completos / 12 KB, excluyendo intentos fallidos.

Los turnos nuevos de NEXO no consumen ni quedan bloqueados por el saldo mensual de
WhatsApp. El historial de consumo anterior permanece intacto; no se convierte en
mensajes ni se reescriben consumos ya registrados. ElevenLabs, transcripción y
Meta tienen controles separados y este cambio no amplía sus planes.

## Ledger mensual de WhatsApp y compatibilidad anterior

Un crédito equivale a **1.000 tokens de entrada + salida**. Se conservan tres
decimales: una llamada de 75 tokens de entrada y 175 de salida consume 0,250
créditos. También se cuentan el contexto reenviado, las instrucciones del agente,
las definiciones y resultados de herramientas y las llamadas posteriores del modelo.
No se deduce un crédito fijo por mensaje ni por conversación.

## Cupos

- Esencial: **1.000 créditos mensuales**.
- Crecimiento: **4.000 créditos mensuales**.
- Equipo: **10.000 créditos mensuales**.
- Negocios sin suscripción vigente verificada y cuentas sin negocio: **20 créditos
  de prueba mensuales**, configurables.
- La demostración pública comparte un presupuesto de **100 créditos diarios**
  entre todos los visitantes. Cambiar el identificador de sesión no renueva ese presupuesto.

WhatsApp conserva el saldo mensual del negocio. Las rutas antiguas que no usan
una reserva de mensaje siguen usando este ledger por compatibilidad. El pago
anual también tiene un cupo mensual. Los periodos se renuevan al comienzo del mes UTC (o del día UTC
para la demo); la interfaz muestra la fecha y hora en Colombia. Los créditos no
consumidos no se acumulan. Esta primera versión no incluye compra de recargas.

Los cupos efectivos se configuran en `public.credit_limits`, accesible solo por
administración. Si cambian los cupos comerciales, actualizar también
`MONTHLY_CREDITS` y el texto de los planes en `lib/plans.ts`.

## Reserva y descuento

En WhatsApp y las rutas anteriores, antes de **cada llamada al modelo**, el servidor reserva un presupuesto
conservador de entrada y la salida máxima. El proveedor recibe una salida máxima
reducida si queda menos saldo; si no hay suficiente reserva para entrada y una
respuesta mínima, la llamada se rechaza. Dos llamadas no pueden reservar los
mismos tokens: la reserva se hace dentro de una transacción con bloqueo del saldo.

Al recibir `usage.prompt_tokens` y `usage.completion_tokens`, una transacción
descuenta el consumo real y devuelve la parte no utilizada de la reserva.
La liquidación admite reintentos con el mismo ID sin duplicar el descuento; un
reintento de reserva no autoriza una segunda llamada. La liquidación permanece
en el periodo donde se reservó, aunque la respuesta termine el mes siguiente.

El streaming solicita `stream_options.include_usage`. Se procesan correctamente
fragmentos UTF-8, CRLF y la última línea sin salto. Groq puede repetir los mismos
totales en el fragmento de finalización y en el fragmento de uso: se validan y se
liquidan una sola vez, después de recibir `[DONE]`. Totales finales contradictorios
o una transmisión interrumpida dejan la reserva pendiente. Los fragmentos de texto
nunca se cuentan como tokens. Si el proveedor no devuelve uso válido, la solicitud
no se presenta como completada ni se factura como cero.

Una respuesta HTTP rechazada por el proveedor libera la reserva. Una cancelación,
un fallo de red de resultado incierto, la falta de `usage` o un fallo de liquidación
mantienen la reserva pendiente: no hay un descuento estimado ni una devolución
automática que permita gastar sin medición. Se evita reintentar una petición de
red incierta. Estos casos necesitan reconciliación administrativa usando el registro
del proveedor. No liberar indiscriminadamente las reservas antiguas.

El presupuesto de entrada es conservador, no un tokenizador exacto. Si un proveedor
informa un consumo mayor al presupuesto reservado, se registra íntegro; el saldo
queda agotado y se bloquean llamadas posteriores. No se oculta consumo mediante
un límite al descuento.

## Activación y puesta en marcha

1. Aplicar las migraciones anteriores y
   `supabase/migrations/20261006131034_token_credits.sql` **antes de desplegar** el código.
2. Verificar que el proveedor compatible con Chat Completions devuelva tokens
   de entrada/salida y `usage` en streaming. Si no lo soporta, cambiar de proveedor
   o implementar su medición oficial antes de habilitarlo.
3. Mantener los eventos Stripe `customer.subscription.created`,
   `customer.subscription.updated` y `customer.subscription.deleted` habilitados.
   El webhook consulta el estado vigente en Stripe y devuelve 503 si no puede
   persistirlo, para permitir reintentos. Los cambios de plan modifican la cuota
   sin borrar el consumo del mes. La cancelación, vencimiento o estado no activo
   retiran el cupo pagado y dejan únicamente el cupo de prueba configurado.
4. Las suscripciones existentes se inicializan como `unknown`, sin conceder un
   cupo pagado no verificado. Revalidarlas desde Stripe mediante el flujo existente
   de reclamación de suscripción o un evento legítimo antes de lanzar el cambio.
5. Ejecutar `npm run test:credits`, `npm run test:jarvis`, `npm run test:pwa`
   y `npm run build`. Realizar después una prueba de proveedor y webhook en un
   entorno de pruebas, sin cobros ni envíos a clientes reales.

Sin las nuevas funciones de base de datos, las llamadas de IA se bloquean con un
mensaje de saldo no disponible. No hay una alternativa que ignore el presupuesto.
La migración se aplicó el 6 de octubre de 2026 a `hdrjzcxlhpzpayhrjafk`, mediante
la integración de Supabase, con versión remota `20261006144201` y nombre
`token_credits`. Se comprobaron los cupos y permisos del servidor. El cliente
se verificó también con el proveedor Groq real, incluyendo sus totales repetidos
en streaming. Esta verificación no sustituye una prueba del flujo completo de
pago y webhooks de Stripe.

## Seguridad y operación

`/api/credits` resuelve usuario y membresía en el servidor; no acepta el negocio
del navegador y no guarda la respuesta en caché. Las tablas de periodos y
solicitudes tienen RLS de lectura por propietario o miembro del negocio, sin
escritura desde el navegador. Las cuatro funciones de saldo se ejecutan con
`SECURITY INVOKER` y permisos de ejecución únicamente para `service_role`.
El simulador de desarrollo devuelve 404 en producción y exige una membresía con
permiso de operación en desarrollo para que no permita gastar el saldo de otro negocio.

Las solicitudes de IA, llamadas de herramientas y el modo shadow consumen tokens
y por tanto consumen créditos. Guardar una preferencia explícita sin llamar al
modelo no consume créditos. Esta unidad no factura el audio de ElevenLabs, la
transcripción de voz ni los cargos de Meta: esas integraciones mantienen sus
controles existentes y necesitan su propia unidad si se desea incluirlas.

Para revisar reservas pendientes, consultar con acceso administrativo:

```sql
select id, owner_key, period_start, channel, reserved_tokens, created_at
from public.credit_requests
where state = 'reserved'
order by created_at;
```

Con el consumo confirmado por el proveedor, liquidar el ID original mediante
`settle_credits(id, tokens_in, tokens_out, model)`. Solo usar `release_credits(id)`
si se confirmó que no hubo consumo. Las restricciones evitan devolver solicitudes
ya liquidadas o liquidar una solicitud que ya se devolvió.

Pruebas: `tools/credits/sql.test.mjs` aplica todas las migraciones en Postgres
embebido (PGlite) y verifica RLS, permisos, cupos, liquidación y cambios de periodo.
PGlite serializa sus consultas: la prueba de solicitudes competidoras verifica el
saldo compartido, pero no sustituye una prueba de carga con múltiples conexiones
en un servidor Postgres. `tools/credits/metering.test.mjs` prueba el cliente y los
medidores con respuestas controladas, sin usar proveedores reales.
