# Pagos y portal de Stripe

Abre `/dashboard/billing` con la cuenta propietaria del negocio. En Jarvis está
en su menú, «Planes y pagos»; también aparece en el CRM. Usa Stripe Checkout para
contratar y el Customer Portal para consultar facturas, actualizar datos/tarjeta,
cambiar entre los tres planes y cancelar al terminar el periodo.

## Prueba

En modo `test` no se cobra dinero real. El panel identifica ese modo.
Tarjeta de prueba: `4242 4242 4242 4242`, fecha futura y CVC de tres dígitos.
No uses tarjetas reales. Una tarjeta rechazada se puede probar con
`4000 0000 0000 0002`. [Tarjetas oficiales](https://docs.stripe.com/testing).

Los planes se facturan en USD: Esencial $30/mes, Crecimiento $60/mes y Equipo
$100/mes; anual con 20% de descuento. El cambio de plan desde el portal puede
generar una factura de prorrateo que Stripe muestra antes de confirmar.
Los créditos siguen siendo mensuales y no se reinicia su consumo al cambiar el plan.

El webhook debe apuntar a `https://chatbot-ai-gold-two.vercel.app/api/stripe/webhook`
y escuchar `customer.subscription.created`, `customer.subscription.updated` y
`customer.subscription.deleted`. Consulta el estado vigente en Stripe antes de
guardar y devuelve 503 en fallos de base de datos para permitir reintentos.
El retorno de Checkout comprueba también la sesión mediante un POST autenticado.
El parámetro de URL «success» por sí solo no activa planes.

## Configuración

Variables privadas: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PORTAL_CONFIGURATION_ID`, `STRIPE_WEBHOOK_ENDPOINT_ID`.
`STRIPE_MODE` es `test` por defecto; solo admite `test` o `live`.
`APP_URL` debe ser el origen público canónico, sin ruta.
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, si está definida, debe pertenecer al mismo
modo; la pasarela alojada no necesita cargar esa clave en el navegador.

Después de aplicar `supabase/migrations/20261006210913_stripe_billing_portal.sql`:

```powershell
npm run stripe:setup
node tools/mcp/env-cli.mjs sync
```

El configurador crea o reutiliza productos, seis precios (mensual y anual),
configuración del portal y un webhook de ese modo. Guarda automáticamente el
secreto del webhook en `.env.local` sin mostrar valores y sincroniza el modo
en la base de datos. La sincronización local existente debe seguir habilitada
y dirigida únicamente a Production. Después hay que desplegar para que Vercel
utilice las variables nuevas. Cambiar un secreto de otro webhook manualmente
rompería la verificación de firmas.

## Pasar a live

1. Completa la activación de tu cuenta en Stripe: debe permitir cobros reales.
2. Cambia de forma privada `STRIPE_SECRET_KEY` y, si existe,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` por las claves **live de la misma cuenta**.
   Pon `STRIPE_MODE=live` y conserva el `APP_URL` canónico.
3. Ejecuta `npm run stripe:setup -- --live`. El comando comprueba que Stripe
   permita cobrar, crea el catálogo, portal y webhook live y guarda el nuevo
   secreto. No convierte ni reutiliza clientes/suscripciones de test.
4. Sincroniza Production con `node tools/mcp/env-cli.mjs sync` y despliega.
   Hasta que coincidan el modo del servidor y el de la base de datos,
   Checkout y el portal fallan de forma segura. El cambio de modo retira el cupo
   pagado que proceda de test; los clientes necesitan contratar en live.
5. Comprueba que desaparezca la etiqueta de prueba y valida eventos/facturas
   live con una transacción real explícitamente autorizada. Nunca uses tarjetas
   de prueba en live.

Stripe mantiene test y live separados: no basta con cambiar una sola clave.
El comando prepara los recursos del modo elegido sin cambios de código.
[Entornos y claves](https://docs.stripe.com/keys),
[portal](https://docs.stripe.com/customer-management/integrate-customer-portal).

## Seguridad y validación

Solo `owner` puede contratar, abrir el portal, descartar un pago pendiente o
verificar un pago. Se comprueba el origen de los POST. El navegador no elige
customer, tenant, importe, precio ni URL de retorno. La activación exige cuenta,
modo, negocio y precio válidos; conocer una suscripción anónima no permite reclamarla.
Las tablas de pagos tienen RLS y acceso exclusivamente del servidor.
Un bloqueo de fila y claves de idempotencia evitan crear sesiones simultáneas
para planes distintos o duplicar sesiones al reintentar. El botón de descarte
expira las sesiones pendientes del cliente antes de liberar la reserva.

Pruebas: `npm run test:stripe`, `npm run test:credits`, `npx tsc --noEmit`
y build de producción. Los tests cubren autorización, falsificación de pagos,
aislamiento entre negocios/modos, reintentos y corte del cupo test al pasar a live.
