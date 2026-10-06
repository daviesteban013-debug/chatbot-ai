# Archivos en Jarvis

Jarvis web permite adjuntar PDF con texto o escaneados, fotos PNG/JPG/JPEG/WebP, Excel XLSX, CSV, Word DOCX, TXT y Markdown desde el clip o arrastrándolos al cuadro de conversación. Requiere una cuenta autenticada. Puede responder sobre el contenido y citar archivo y página, hoja/fila/celdas, párrafo o línea. Los archivos enviados permanecen disponibles para preguntas posteriores en esa conversación.

## Uso

1. Enciende Jarvis, adjunta hasta tres archivos y espera a que termine la lectura.
2. Escribe o dicta la pregunta. También puedes enviar los archivos sin texto para pedir un análisis inicial.
3. Consulta las referencias en la respuesta. En Excel/CSV, Jarvis dispone de cálculos de suma, promedio, mínimo, máximo y conteo por columna y rango de filas.
4. Descarga o elimina documentos desde la lista. «Mis otros archivos» permite recuperar cargas pendientes después de recargar la página y gestionar archivos de conversaciones anteriores. Un archivo ya enviado pertenece a esa conversación; para usarlo en otra, vuelve a subirlo.

## Alcance y límites

- Hasta 3 MB por archivo; 40 archivos y 60 MB almacenados por cuenta.
- PDF: primeras 80 páginas. Las páginas sin texto extraíble se renderizan y leen con OCR en español e inglés, hasta 8 páginas escaneadas por archivo y un presupuesto aproximado de 32 segundos. Los PDF mixtos conservan sus referencias digitales y OCR. Si quedan páginas sin leer, se indica extracción parcial. «Leer con OCR» actualiza los escaneos antiguos conservando el original y su conversación.
- Imágenes: hasta 12 megapíxeles, sin animación; se corrige la orientación y se reduce el tamaño para OCR. Una imagen sin texto legible conserva un aviso. OCR puede equivocarse en cifras, nombres, escritura a mano o fotos borrosas: se muestra una advertencia y confianza baja cuando corresponde.
- XLSX: hasta 20 hojas, 5.000 filas y 100 columnas. CSV: 5.000 filas y 100 columnas. Hasta 5.000 referencias y 200.000 caracteres por archivo, con aviso si la extracción queda parcial.
- Excel conserva fórmulas y sus resultados guardados. No recalcula fórmulas ni ejecuta macros. Para fórmulas sin resultados guardados, abre, recalcula y guarda el libro antes de cargarlo.
- CSV usa UTF-8, reconoce delimitadores y campos entre comillas. Para cálculos, interpreta números enteros o con punto decimal; valores ambiguos, símbolos monetarios y coma decimal se conservan como texto.
- Las respuestas reciben extractos relevantes y pueden consultar más mediante herramientas. Esto no garantiza que el modelo revise cada referencia de un documento extenso en una sola respuesta.
- Esta fase permite leer y analizar archivos en Jarvis web. Todavía no incluye adjuntos de WhatsApp, formatos XLS/DOC antiguos, edición de los archivos ni generación de documentos descargables.

## Activación en Supabase

La migración `supabase/migrations/20261006140958_jarvis_files.sql` crea la tabla, las restricciones de propiedad/cupo y el bucket privado `jarvis-files`. Se aplicó el 6 de octubre de 2026 a la instancia `hdrjzcxlhpzpayhrjafk`, mediante la integración de Supabase, con la versión remota `20261006144202` y nombre `jarvis_files`. Se comprobaron el bucket privado, el límite de tamaño, RLS y los permisos del servidor. En otras instancias debe aplicarse junto con las migraciones previas del proyecto.

El servidor usa las variables Supabase existentes, incluida `SUPABASE_SERVICE_ROLE_KEY`. Esa clave nunca se expone al navegador. Todas las rutas validan al usuario; la IA recibe únicamente archivos autorizados para la cuenta y conversación. No se crean enlaces públicos ni políticas de acceso directo del cliente a Storage. Las descargas pasan por una ruta autenticada con caché privada deshabilitada. El borrado elimina el objeto y su registro. Eliminar una fila directamente fuera de estas rutas requiere limpiar el objeto de Storage por separado.

La extracción corre en un worker de Node con tiempo máximo de 45 segundos y máximo de dos lectores simultáneos por proceso. Los archivos Office se verifican antes de descomprimir (hasta 24 MB descomprimidos) y los archivos con macros se rechazan. Nombres y contenido se envían como datos no confiables, separados de las instrucciones; las herramientas vuelven a limitar el acceso al conjunto autorizado.

Node 22.3 o superior de una versión compatible con Next, recomendado Node 24. `next.config.ts` incluye el worker de extracción, el worker de PDF , los modelos OCR locales español/inglés, el worker de Tesseract y las dependencias nativas de PDF/imágenes en el paquete del servidor. Los paquetes empleados son pdf-parse, ExcelJS, Mammoth, Papa Parse, Decimal.js, Tesseract.js y Sharp. Canvas se fija en 1.0.10 para que el lector PDF funcione en workers aislados; las pruebas incluyen esa ejecución. Los modelos optimizados vienen empaquetados: no requieren claves ni descargas de terceros durante la lectura. Se preparan en una carpeta temporal única y se limpia al terminar, cancelar o agotar el tiempo.

El procesamiento local de archivos no descuenta tokens de IA. Los extractos, preguntas, resultados de herramientas y respuestas que consume el modelo entran en el medidor de créditos existente: 1 crédito = 1.000 tokens de entrada + salida.

## Verificación

`npm run test:files` comprueba extracción con archivos reales, referencias, fórmulas guardadas, aritmética decimal, límites, rechazo de archivos inválidos, autenticación, acceso entre cuentas, vinculación de conversaciones, descargas/borrado, integración con el agente y la migración con RLS/cupos. Para despliegue: `npm run build`, seguido de `npm run test:files:runtime`, que verifica los lectores principales y OCR de una foto y un PDF escaneado usando únicamente dependencias incluidas en el paquete del servidor, en una carpeta temporal aislada.

El 6 de octubre de 2026 se publicó y promovió la versión `dpl_D6RLhP2QwhqVAf3ou8NK2cRScZRg` en https://chatbot-ai-gold-two.vercel.app. La compilación de Vercel y las 127 pruebas automáticas pasaron. Con cuentas temporales se verificaron los seis formatos, descarga y borrado, aislamiento entre cuentas por API/RLS, conservación de adjuntos en el historial, suma de Excel mediante herramienta, lectura del código de un PDF, liquidación de dos llamadas de IA y audio neuronal real. Las cuentas, sesiones y archivos sintéticos se eliminaron al finalizar. Esta prueba usó solicitudes autenticadas al servidor; no sustituye la prueba de micrófono, arrastre o reproducción en cada navegador/dispositivo.

La actualización OCR del 6 de octubre de 2026 se publicó y promovió al enlace habitual como `dpl_AeRCfSdn4Xk6avdag4yC97uu8nRk`. Pasaron 133 pruebas, ESLint y la compilación local/Vercel. El paquete aislado leyó PDF, XLSX, DOCX, CSV, una foto PNG y un PDF escaneado. En el servidor se verificaron OCR de una foto y un escaneo, relectura de un archivo anterior, aislamiento entre cuentas, respuesta del modelo con el código extraído por OCR, cálculo Excel, historial, créditos, voz y borrado. Se eliminaron las cuentas temporales y sus documentos/sesiones al terminar.
