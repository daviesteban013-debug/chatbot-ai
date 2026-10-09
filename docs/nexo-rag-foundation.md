# NEXO: base de conocimiento por negocio — paso 1

Implementado el 9 de octubre de 2026. La migración `20261009153340_tenant_knowledge_base.sql` está aplicada en Supabase; pgvector instalado: **0.8.2**, esquema `extensions`.

## Qué se tomó de la guía

- Embeddings de `text-embedding-3-small`, con **1536 dimensiones**, y búsqueda por distancia coseno mediante índice HNSW.
- Separación de conocimiento e identidad del agente. Se conservan `agents` (agente comercial) y `jarvis_configs` (configuración de NEXO); no se introduce una tercera tabla `agent_configs` con datos duplicados. La voz por negocio queda pendiente de integrar con su configuración existente.
- El negocio es `tenants.id`; las cuentas acceden mediante `tenant_members`. Una empresa puede tener varios usuarios y un usuario varias empresas. `tenant_id = auth.uid()` no representa este modelo.

## Estructura y acceso

`knowledge_sources` identifica cada documento o texto por negocio, con nombre, estado y revisión. `knowledge_chunks` guarda sus fragmentos, vector, página y metadatos para citar el origen. Una clave foránea compuesta impide asociar un fragmento a un documento de otra empresa. La identidad de ambas tablas no se puede reasignar mediante un UPDATE.

Ambas tablas tienen RLS. Los miembros `owner`, `agent` y `viewer` pueden consultar el conocimiento de su negocio. Los clientes autenticados no pueden insertar, modificar ni borrar estas tablas. El futuro proceso de ingesta escribirá desde el servidor tras comprobar permisos, propiedad del documento y cuota. Los adjuntos personales de `jarvis_files` permanecen separados: subir uno a un chat no lo convierte automáticamente en conocimiento compartido.

La función `match_knowledge_chunks` usa **SECURITY INVOKER**, comprueba la pertenencia al negocio solicitado y aplica RLS. Solo se concede su ejecución a `authenticated`; `anon` y `service_role` no pueden ejecutarla. Devuelve como máximo 10 fragmentos de documentos `ready` y de su revisión vigente, con similitud y referencias. Valida dimensiones, vector no nulo, umbral y límite.

La utilidad tipada `lib/knowledge/retrieve.ts` recibe el cliente Supabase de la sesión y el negocio resuelto por el servidor (`getCurrentTenant`). No crea clientes administrativos ni genera embeddings. Conserva las referencias del resultado y oculta detalles de errores SQL.

**RLS no protege operaciones con una clave que omite RLS.** `service_role` conserva acceso de ingesta y debe permanecer exclusivamente en el servidor. No se debe sustituir el cliente autenticado por el cliente administrativo para recuperar conocimiento. WhatsApp necesitará un adaptador específico que resuelva el negocio desde la cuenta del canal y valide la firma del webhook; no debe aceptar el negocio elegido por el modelo o por un campo arbitrario del mensaje.

HNSW es aproximado: `hnsw.iterative_scan = strict_order` y `ef_search = 80` ayudan con los filtros, pero no garantizan recuperar todos los vecinos ni una latencia concreta. Hay que medir precisión y tiempos con datos representativos antes de optimizar el flujo de voz. En documentos pequeños PostgreSQL puede elegir legítimamente una búsqueda exacta.

## Comprobaciones

```powershell
npm run test:knowledge
node --test tools/agent/order-proposals-sql.test.mjs tools/files/sql.test.mjs tools/credits/sql.test.mjs
npx tsc --noEmit
```

Resultado: **14 pruebas nuevas + 26 de regresión**, todas aprobadas; TypeScript y ESLint de los archivos modificados aprobados. Las pruebas SQL ejecutan todas las migraciones sobre PostgreSQL/PGlite con pgvector real, sin emular vectores ni RLS.

Cubren búsqueda, índice, referencias, miembros con distintos roles, usuarios de varias empresas, negocio falsificado, revocación de membresía, permisos de escritura, dimensiones, contenido y metadatos inválidos, versiones antiguas, fuentes archivadas, integridad referencial y borrado en cascada.

`tools/knowledge/live-smoke.sql` también pasó contra Supabase con `SET LOCAL ROLE authenticated`. Usa dos cuentas existentes para crear dos negocios temporales dentro de una transacción, verifica búsqueda y aislamiento y ejecuta **ROLLBACK**. No deja documentos de prueba, no envía correos y no invoca proveedores de IA.

Los asesores de Supabase no detectaron problemas de RLS, permisos, search_path o claves foráneas en los objetos nuevos. Los avisos de [índices aún sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) son esperables antes de cargar documentos reales. Persisten avisos anteriores en otros objetos: [search_path de funciones](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [función SECURITY DEFINER accesible a anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [índices de claves foráneas](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) y [evaluación de auth.uid en tenant_members](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan). Se deben revisar por separado; este paso no certifica la seguridad de toda la aplicación.

## Siguiente entrega

La base está creada y vacía. **NEXO todavía no consulta estos documentos en sus respuestas.** No se ha añadido interfaz, realizado consumo de OpenAI ni cambiado la voz.

El siguiente paso es la ingesta: subir un documento desde el CRM, comprobar rol y cuotas antes de usar la API, extraer/dividir texto, generar embeddings y publicar una revisión completa de forma atómica. Después se conectará la recuperación con el agente/simulador, guardando los fragmentos usados en cada respuesta. Precios, stock y pedidos seguirán consultando las tablas del CRM; un PDF no sustituirá su fuente operativa ni la confirmación humana.

Documentación consultada: [pgvector y HNSW](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes), [RAG con permisos](https://supabase.com/docs/guides/ai/rag-with-permissions) y [changelog de Supabase](https://supabase.com/changelog).
