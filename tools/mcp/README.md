# MCP programador del proyecto

Este servidor local conecta un cliente MCP con Codex para leer, modificar y verificar el repositorio completo. También consulta GitHub y los despliegues del proyecto vinculado a Vercel. No requiere Supabase ni una clave de OpenAI si Codex tiene una sesión de ChatGPT iniciada.

## Preparación

```powershell
npm install
codex login
gh auth login
vercel login
vercel link
```

Node.js 18 o posterior, Git, GitHub CLI y Vercel CLI deben estar disponibles. El repositorio debe tener un remoto de GitHub y la vinculación local `.vercel/project.json`. Las credenciales permanecen en los almacenes de cada CLI.

## VS Code con Copilot

La configuración está en `.vscode/mcp.json`. Abre este repositorio en VS Code, ejecuta **MCP: List Servers**, inicia `chatbot_programador` y habilita sus herramientas en el chat del agente.

Ejemplo de petición:

> Usa chatbot_programador para revisar GitHub y los deploys. Luego implementa paginación en el catálogo, conserva los filtros y verifica los cambios. Consulta estado_tarea hasta que termine y muéstrame el resultado.

## Otros clientes locales

Usa transporte STDIO, comando `node` y como único argumento la ruta absoluta a `tools/mcp/server.mjs`. No uses `npm run mcp` como comando STDIO: los mensajes de npm podrían interferir con el protocolo.

En Codex puedes registrar el servidor desde la carpeta del proyecto:

```powershell
codex mcp add chatbot_programador -- node C:/Users/USUARIO/Chatbot.ai/tools/mcp/server.mjs
```

Para Cline añade una entrada equivalente en su configuración de servidores MCP bajo `mcpServers`:

```json
{
  "chatbot_programador": {
    "command": "node",
    "args": ["C:/Users/USUARIO/Chatbot.ai/tools/mcp/server.mjs"],
    "disabled": false,
    "autoApprove": []
  }
}
```

## Herramientas

- `estado_proyecto`: carpeta y cambios locales de Git.
- `programar`: inicia una tarea en modo `programar` (escritura en el proyecto) o `revisar` (solo lectura).
- `estado_tarea`: progreso, archivos modificados, resultado y comprobaciones. `completed` indica que Codex terminó la ejecución; lee el resultado para saber si alcanzó el objetivo.
- `continuar_tarea`: continúa la conversación de una tarea conocida, conservando sus permisos.
- `cancelar_tarea`: solicita detenerla; conserva los cambios ya aplicados.
- `estado_github`: commit principal, PR abiertos, checks y últimas ejecuciones de CI.
- `estado_deploys`: últimos cinco despliegues de producción, preview o ambos.
- `revisar_entrega`: GitHub y producción, con alertas de fallos y commits diferentes.
- `estado_env`: nombres, entornos y estado de sincronización; nunca devuelve valores.
- `sincronizar_env`: copia los valores de `.env.local` al entorno configurado en Vercel.
- `configurar_sync_env`: activa o pausa la sincronización y selecciona los entornos.

Las tareas devuelven un identificador inmediatamente para evitar los límites de tiempo del cliente MCP. Consulta su estado hasta `completed`, `failed`, `canceled`, `timed_out` o `interrupted`. El límite por turno es de 30 minutos. Cada servidor ejecuta una tarea a la vez; no inicies varios servidores programadores sobre la misma carpeta simultáneamente.

Se consulta GitHub y Vercel antes y después de cada turno. Si una integración no está disponible se informa el error; no se inventa un estado exitoso. Los checks de GitHub corresponden al commit principal, no a cada PR. Las consultas devuelven un máximo de diez PR y cinco ejecuciones/despliegues. READY en Vercel indica un despliegue construido; no demuestra por sí solo que todas las funciones del sitio estén sanas.

Los estados y resultados se guardan localmente en `.codex/mcp-programador/`, excluido de Git. Las sesiones de Codex permiten continuar tareas después de reiniciar el servidor. Detener el servidor cancela los turnos activos; puedes continuarlos después. El MCP usa la cuenta y los límites de Codex disponibles en este equipo. `MCP_CODEX_MODEL` permite seleccionar un modelo; `MCP_CODEX_BIN` puede indicar un ejecutable nativo de Codex; `MCP_VERCEL_CLI` puede indicar la ruta de `vercel/dist/vc.js` en Windows.

El agente ejecuta comandos y cambia archivos reales con acceso de escritura al proyecto. Sigue `AGENTS.md`; el encargo debe autorizar de forma explícita cualquier push o publicación. No expongas este servidor local directamente a Internet.

## Seguimiento y comprobaciones

```powershell
node tools/mcp/monitor.mjs
npm run test:mcp
npm run test:mcp:live
```

`monitor.mjs` realiza una consulta puntual, útil para un seguimiento programado. El MCP no permanece vigilando si su cliente está cerrado. El seguimiento periódico se configura por separado en Codex. La prueba `live` hace consultas reales de GitHub/Vercel y pide a Codex una revisión de solo lectura; consume la cuota normal de la cuenta.

La integración usa el SDK oficial de OpenAI (`@openai/codex-sdk`). Las versiones actuales del CLI ya no ofrecen `codex mcp-server`; este servidor propio publica las herramientas MCP y utiliza el SDK para los turnos de Codex.

## Sincronización automática de variables

En este equipo se habilitó **solo Production** por petición del usuario. `.env.local` es la fuente de los valores de ese entorno. Las variables nuevas se crean; las existentes se actualizan. Las variables privadas nuevas se guardan como `sensitive`; las existentes conservan su protección cifrada. `NEXT_PUBLIC_*` continúa siendo visible para el navegador cuando Next.js construye la aplicación.

Al guardar `.env.local`, el observador espera dos segundos antes de sincronizar. También comprueba el archivo cada diez segundos y el estado remoto cada cinco minutos. Una huella privada evita repetir escrituras cuando el valor no cambia. Una edición remota posterior se reemplaza por el valor local mientras la sincronización permanezca activa.

Los valores viajan a la CLI de Vercel por entrada estándar; no se añaden a argumentos, archivos temporales, respuestas MCP ni registros. Los archivos de estado locales contienen nombres, fechas y huellas privadas; están excluidos de Git. La vinculación se fija al proyecto y equipo de Vercel autorizados: cambiarla requiere configurar nuevamente la sincronización.

Se omiten valores vacíos y variables internas `VERCEL_*`, `MCP_*`, `CODEX_*`, `DOTENV_*`, `NODE_ENV`, `PORT`, `PATH`, `HOME` y `USERPROFILE`. Quitar una variable del archivo o dejarla vacía **no la borra en Vercel**. Las variables de otros entornos, las específicas de ramas y las administradas por integraciones se conservan. Se admiten comentarios, comillas, valores multilínea, referencias `$NOMBRE` / `${NOMBRE}` y dólares escapados `\$`; no se ejecutan comandos encontrados en el archivo.

Los cambios de variables se aplican en el **siguiente despliegue**. Esta sincronización no lanza un redeploy. `estado_env` informa cuando está pendiente y lo verifica contra nuevos despliegues de producción.

El MCP observa el archivo mientras su proceso esté activo. También puedes ejecutar un observador independiente, sin mantener el chat abierto:

```powershell
npm run mcp:env:watch
```

En este equipo se inició un observador independiente en segundo plano. Si reinicias Windows, vuelve a iniciarlo o abre el cliente MCP. El seguimiento horario de Codex también comprueba y sincroniza como respaldo cuando la app está disponible.

Comprobaciones puntuales y pausa:

```powershell
node tools/mcp/env-cli.mjs status
node tools/mcp/env-cli.mjs sync
node tools/mcp/env-cli.mjs pause
node tools/mcp/env-cli.mjs enable production
```

La pausa deshabilita futuras sincronizaciones tanto en el MCP como en el observador independiente. Los procesos comparten un bloqueo local para evitar escrituras simultáneas.

Documentación: [SDK de Codex](https://learn.chatgpt.com/docs/codex-sdk), [MCP en VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [API de despliegues de Vercel](https://vercel.com/docs/rest-api/deployments/list-deployments), [variables y nuevos despliegues](https://vercel.com/docs/environment-variables/managing-environment-variables).
