# NEXO en Windows y Mac

La aplicación carga la misma cuenta y backend de Nexo.ai. Desde la versión 0.2.0 abre el **CRM maximizado** al iniciar. Si hace falta acceder a la cuenta, el formulario ocupa esa misma ventana. Después aparece un orbe compacto, sin tarjeta de fondo, encima de las ventanas; al pulsarlo despliega la conversación. El CRM conserva el panel abierto al volver a activar la app.

## Instalar y usar

1. Windows: ejecuta el instalador `.exe` de la página. Mac: abre el `.dmg` universal y arrastra **NEXO** a **Aplicaciones**; requiere macOS 13 o posterior y funciona con Apple Silicon e Intel.
2. Inicia sesión en la ventana principal. Google se abre en el navegador normal; al finalizar, pulsa **Abrir NEXO en mi computadora** para volver al CRM. También puedes entrar con correo y contraseña. El orbe permanece oculto durante el acceso.
3. Pulsa **Encender NEXO** y permite el micrófono. No se activa al iniciar el sistema ni al abrir la aplicación. Después queda escuchando entre respuestas aunque trabajes en otra ventana. En macOS el permiso corresponde a NEXO; si lo denegaste, revísalo en Ajustes del Sistema → Privacidad y seguridad → Micrófono y reinicia NEXO.
4. Arrastra el pequeño asa del orbe o la barra superior del panel para moverlo. La flecha y **Alt + Shift + N** contraen o expanden la burbuja. Desde la navegación del CRM, **NEXO** abre el asistente sin abandonar el panel actual. El acceso **CRM** del asistente vuelve al resumen.
5. En **Personalizar burbuja**, elige un color o usa el selector. Se guarda en tu computadora.

Comandos: **abre pedidos**, **abre catálogo**, **abre conversaciones**, **abre handoffs**, **abre aprobaciones**, **abre configuración**, **abre planes y pagos**, **abre resumen** y **abre NEXO**. También admite **NEXO, apágate**. Abrir paneles no consume llamadas al modelo de lenguaje. Las consultas del negocio siguen usando las herramientas del backend; abrir un panel no modifica sus datos.

El icono de micrófono apaga la escucha. Contraer el orbe conserva la escucha si ya estaba activada; su botón de encendido permite apagarla sin expandirlo. **Salir de NEXO**, en Personalización o en el icono de la bandeja del sistema, cierra la aplicación y libera el micrófono. Cerrar la ventana principal también termina la app. Cerrar sesión descarga el asistente y libera su micrófono. El botón cuadrado interrumpe la respuesta; el micrófono puede seguir armado.

## Voz

La app detecta frases localmente y transcribe clips de hasta 12 segundos con `gpt-4o-mini-transcribe` usando `OPENAI_API_KEY` exclusivamente en el servidor. Los silencios no se envían. Habla después de la respuesta: la entrada se pausa durante generación/reproducción para evitar eco. No es una llamada de voz de doble sentido con interrupción automática.

La transcripción consume saldo de la API de OpenAI; ElevenLabs mantiene su facturación aparte. El endpoint exige una cuenta autenticada, limita el tamaño de los clips y aplica un límite por usuario **por instancia del servidor** (no un presupuesto global entre todas las instancias de Vercel). No sustituye un límite de gasto configurado en el proveedor. No se guardan clips en nuestra base de datos. El proveedor procesa el audio según la configuración y políticas de tu cuenta.

## Desarrollo y empaquetado

```powershell
npm ci --prefix desktop
npm start --prefix desktop
npm test --prefix desktop
npm run package --prefix desktop
```

En un Mac, `npm run package:mac --prefix desktop` genera `NEXO-0.2.1-mac-universal.dmg`. El workflow **NEXO · macOS beta** permite construirlo manualmente en GitHub Actions y comprobar el arranque del mismo DMG en máquinas Intel y Apple Silicon. Solo empaqueta los archivos declarados en `build.files`; nunca requiere las claves del backend.

La beta de macOS usa firma ad hoc, sin certificado Developer ID ni notarización de Apple. Gatekeeper puede bloquear su apertura. La distribución sin ese aviso requiere el certificado del editor y notarización, pendientes de configurar. No desactives las protecciones del sistema. La web sigue disponible para usar el CRM sin instalar la beta.

Electron usa contexto aislado, sandbox y una sesión local separada del navegador. Solo la ventana de NEXO puede solicitar micrófono; cámara y captura de pantalla están bloqueadas. El puente nativo admite únicamente preferencias, paneles permitidos, el acceso Google por PKCE y salir. No incorpora claves de OpenAI, ElevenLabs ni Supabase privadas.

El puente identifica las superficies `crm` y `bubble` para que la ventana principal no use el diseño compacto. Ambas comparten la sesión; solo el asistente tiene acceso al micrófono. Los IPC validan la ventana emisora y su frame principal. `npm test --prefix desktop` comprueba arranque, acceso, retorno OAuth, cierre de sesión, aislamiento y tamaños en varios monitores.

La versión 0.2.1 permite abrir WhatsApp y las fichas de pedidos, conversaciones y handoffs desde NEXO en la ventana CRM existente, conservando el asistente. Los destinos siguen limitados al CRM del servicio; el servidor comprueba que cada registro pertenezca al negocio antes de pedir su apertura.

Para actualizar, cierra NEXO e instala la versión nueva sobre la anterior. En Mac, reemplaza NEXO en Aplicaciones. No borres los datos locales: la sesión y el color usan el mismo perfil. Esta beta no incorpora actualización automática. Publicar únicamente la web cambia el asistente, pero no actualiza el código nativo instalado. Los enlaces de descarga deben cambiarse solo después de construir y publicar los artefactos correspondientes.

Para revisar el diseño sin una sesión ni micrófono, ejecuta Next en desarrollo y abre `/dev/nexo`. Esa ruta devuelve 404 en producción.

El instalador de desarrollo no tiene firma digital de un editor. La firma de distribución se configura al disponer de un certificado de Windows. No se distribuyen `node_modules`, archivos `.env` ni artefactos de empaquetado mediante el deploy de Vercel.
