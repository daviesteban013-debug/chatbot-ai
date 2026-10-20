# Cobro de planes Zorax con Mercado Pago (Colombia)

Los planes de Zorax se cobran en pesos colombianos (COP) con Mercado Pago. Stripe se eliminó.

| Plan | Mensual | Anual (−20 %) |
| --- | --- | --- |
| Esencial | $120.000 | $1.152.000 |
| Crecimiento | $240.000 | $2.304.000 |
| Equipo | $400.000 | $3.840.000 |

Los precios viven en `lib/plans.ts` (`price` en COP por mes, `planTotal`).

## Dos formas de pago

- **Suscripción automática** (`POST /preapproval`, `status: "pending"`): el dueño entra su
  tarjeta en Mercado Pago y se cobra solo cada mes o cada 12 meses. Se cancela desde
  *Planes y pagos*; el plan sigue hasta el final del periodo pagado.
- **Pago por periodo** (Checkout Pro, `POST /checkout/preferences`): tarjeta, PSE o Efecty,
  por 1 o 12 meses. Si ya hay un periodo vigente del mismo plan, el tiempo se suma al final.
  Efecty y PSE quedan *pendientes* hasta que Mercado Pago los aprueba.

## Cómo se decide el plan

`credit_balance()` (SQL) es la única decisión: el negocio tiene su plan si
`tenants.plan_active_until > now()` y `tenants.billing_mode = billing_settings.mode`.
Con una suscripción automática `authorized` hay 3 días de gracia mientras Mercado Pago
reintenta el cobro. Todo lo demás (mensajes de Zorax, créditos de WhatsApp) usa esa función.

Los pagos solo se escriben con RPC privadas (`service_role`):

- `nexo_claim_mp_checkout`: reserva el pago del dueño; bloquea cambiar de plan mientras otro
  plan está vigente o hay una suscripción automática activa.
- `nexo_apply_mp_payment`: idempotente por id de pago; comprueba monto, moneda (COP) y modo
  contra el checkout. Un reembolso o contracargo quita el tiempo no consumido de ese pago.
- `nexo_sync_mp_preapproval`: guarda el estado de la suscripción automática.

El servidor siempre vuelve a consultar el pago en la API de Mercado Pago; ni la URL de
regreso ni el cuerpo de una notificación activan un plan por sí solos.

## Configuración

1. En [Tus integraciones](https://www.mercadopago.com.co/developers/panel/app) crea una
   aplicación (Checkout Pro + Suscripciones).
2. Para pruebas, crea una cuenta vendedora y una compradora de prueba (mismo país: Colombia)
   y usa las credenciales de la vendedora.
3. En *Webhooks > Configurar notificaciones*:
   - URL: `https://<tu-dominio>/api/mercadopago/webhook`
   - Eventos: **Pagos** (`payment`), **Planes y suscripciones** (`subscription_preapproval`,
     `subscription_authorized_payment`).
   - Copia la **clave secreta** de la firma.
4. Variables de entorno (Vercel y `.env.local`):

   ```
   MERCADOPAGO_MODE=test            # test | live
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
   MERCADOPAGO_WEBHOOK_SECRET=...
   APP_URL=https://<tu-dominio>
   ```

   Las credenciales de prueba también empiezan por `APP_USR-`, así que el modo se declara
   con `MERCADOPAGO_MODE`.
5. Aplica la migración `supabase/migrations/20261014120000_mercadopago_billing.sql`
   **antes** de desplegar el código. Elimina las columnas y tablas de Stripe.

## Pruebas

- Paga con la cuenta compradora de prueba en una ventana de incógnito. Tarjeta Visa
  `4013 5406 8274 6260`, CVV `123`, vence `11/30`, titular `APRO` (aprobado) o `OTHE` (rechazado).
- PSE abre un simulador del banco; Efecty en pruebas se queda en *pendiente*.
- Con credenciales de prueba Mercado Pago puede no enviar notificaciones. Al volver a
  `/dashboard/billing?checkout=return`, la página llama a `/api/billing/verify`, que consulta
  el pago y lo aplica. Usa *Simular* en el panel para probar el webhook.
- `npm run test:billing` y `npm run test:credits`.

## Paso a producción

1. Cambia a las credenciales de producción de la aplicación y a la clave secreta del webhook
   de producción.
2. `MERCADOPAGO_MODE=live` y `update billing_settings set mode='live';` en la base de datos.
   Los periodos pagados en modo de prueba dejan de contar al cambiar de modo.
