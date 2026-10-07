# NEXO: presentación y créditos

La portada presenta NEXO con la esfera líquida dorada que sigue el puntero. Una constelación tenue de Three.js comparte el ambiente negro y dorado con login y registro. La biblioteca 3D se carga por separado, el fondo se pausa al ocultar la pestaña y respeta la preferencia de movimiento reducido. Sin WebGL, la esfera conserva su versión CSS.

Los ejemplos del hero cambian la pregunta mostrada, no ejecutan acciones del CRM ni consumen la API. El botón principal abre el registro. La navegación interna conserva `/dashboard/jarvis` para mantener enlaces y sesiones existentes.

La barra del CRM, del panel del agente y de facturación muestra el porcentaje de capacidad disponible que informa el servidor, descontando reservas en curso. Se vacía al consumir el cupo, avisa al llegar al 10 % y muestra agotamiento al llegar a cero. Un error de consulta no se convierte en un saldo ficticio. Ya no presenta cantidades de tokens en estas vistas.

El nombre por defecto y el nombre heredado «Jarvis» se presentan como NEXO; otros nombres personalizados se conservan. Los comandos «NEXO, enciéndete», «NEXO, apágate», «NEXO, abre el CRM» y «NEXO, recuerda que…» funcionan con la misma lógica. Los comandos anteriores se conservan para las personas que ya los usaban. Se actualizaron los textos de acceso, onboarding, instalación y la pantalla pública sin conexión.

Comprobación visual local: escritorio a 1280 px y móvil a 390 px sin desbordamiento horizontal, registro con el nombre nuevo y preguntas seleccionables. Las pruebas cubren porcentaje, reservas, agotamiento, redondeo, comandos, aislamiento de cuentas y caché público. La build de producción usa Turbopack.
