# NEXO en Windows

La aplicación carga la misma cuenta y backend de Nexo.ai. Su burbuja permanece encima de las ventanas, conserva la conversación y abre el CRM en una ventana aparte.

## Instalar y usar

1. Ejecuta `desktop/dist/NEXO-Setup-0.1.0.exe`. El instalador crea un acceso directo **NEXO**.
2. Inicia sesión. Google se abre en el navegador normal; al finalizar, pulsa **Abrir NEXO en mi computadora**. También puedes entrar con correo y contraseña.
3. Pulsa **Encender NEXO** y permite el micrófono. No se activa al iniciar Windows ni al abrir la aplicación. Después queda escuchando entre respuestas aunque trabajes en otra ventana.
4. Arrastra la barra superior para moverlo. La flecha y **Alt + Shift + N** contraen o expanden la burbuja.
5. En **Personalizar burbuja**, elige un color o usa el selector. Se guarda en tu computadora.

Comandos: **abre pedidos**, **abre catálogo**, **abre conversaciones**, **abre handoffs**, **abre aprobaciones**, **abre configuración**, **abre planes y pagos**, **abre resumen** y **abre NEXO**. También admite **NEXO, apágate**. Abrir paneles no consume llamadas al modelo de lenguaje. Las consultas del negocio siguen usando las herramientas del backend; abrir un panel no modifica sus datos.

El icono de micrófono apaga la escucha. **Salir de NEXO**, en Personalización o en el icono de la bandeja del sistema, cierra la aplicación y libera el micrófono. El botón cuadrado interrumpe la respuesta; el micrófono puede seguir armado.

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

Electron usa contexto aislado, sandbox y una sesión local separada del navegador. Solo la ventana de NEXO puede solicitar micrófono; cámara y captura de pantalla están bloqueadas. El puente nativo admite únicamente preferencias, paneles permitidos, el acceso Google por PKCE y salir. No incorpora claves de OpenAI, ElevenLabs ni Supabase privadas.

Para revisar el diseño sin una sesión ni micrófono, ejecuta Next en desarrollo y abre `/dev/nexo`. Esa ruta devuelve 404 en producción.

El instalador de desarrollo no tiene firma digital de un editor. La firma de distribución se configura al disponer de un certificado de Windows. No se distribuyen `node_modules`, archivos `.env` ni artefactos de empaquetado mediante el deploy de Vercel.
