-- =====================================================================
-- Seed de demostración: "Bellisima" — tienda colombiana de bolsos y moda
-- Todo el contenido en español colombiano. Precios en COP (enteros).
-- Ejecutar DESPUÉS de supabase/migrations/001_initial_schema.sql
-- =====================================================================

do $$
declare
  v_tenant   uuid := gen_random_uuid();
  v_agent    uuid := gen_random_uuid();
  v_wa       uuid := gen_random_uuid();

  -- Productos
  v_p01 uuid := gen_random_uuid();  -- Bolso Tote Cuero
  v_p02 uuid := gen_random_uuid();  -- Bolso Shoulder Mediano
  v_p03 uuid := gen_random_uuid();  -- Bolso Hobo Nylon
  v_p04 uuid := gen_random_uuid();  -- Bolso de Noche Brillante
  v_p05 uuid := gen_random_uuid();  -- Cartera Bandolera Cuero
  v_p06 uuid := gen_random_uuid();  -- Cartera Billetera Larga
  v_p07 uuid := gen_random_uuid();  -- Cartera Porta Chequera
  v_p08 uuid := gen_random_uuid();  -- Maleta de Mano Viaje
  v_p09 uuid := gen_random_uuid();  -- Bolso Rimowa Grande
  v_p10 uuid := gen_random_uuid();  -- Mochila Urbana Antirrobo
  v_p11 uuid := gen_random_uuid();  -- Mochila Escolar Juvenil
  v_p12 uuid := gen_random_uuid();  -- Mochila Viajera 40L
  v_p13 uuid := gen_random_uuid();  -- Riñonera Deportiva
  v_p14 uuid := gen_random_uuid();  -- Pañoleta Estampada
  v_p15 uuid := gen_random_uuid();  -- Llavero Pompones
begin

  -- ---------- Tenant ----------
  insert into tenants (id, name, slug, plan, status)
  values (v_tenant, 'Bellisima', 'bellisima', 'pilot', 'active')
  on conflict (slug) do update set name = excluded.name, plan = excluded.plan
  returning id into v_tenant;

  -- ---------- Miembro del tenant (dueño) ----------
  -- NOTA: Reemplazar '00000000-0000-0000-0000-000000000000' por el UUID real
  -- del usuario creado en Supabase Auth (ver en Dashboard > Authentication > Users).
  -- Descomentar y ajustar después de crear el usuario:
  -- insert into tenant_members (tenant_id, user_id, role)
  -- values (v_tenant, '00000000-0000-0000-0000-000000000000', 'owner');

  -- ---------- Cuenta de WhatsApp ----------
  insert into whatsapp_accounts (id, tenant_id, phone_number_id, waba_id, display_phone)
  values (v_tenant, v_tenant, '1234567890', 'waba-bellisima-demo', '+57 300 123 4567')
  on conflict (phone_number_id) do nothing;

  -- ---------- Agente ----------
  insert into agents (id, tenant_id, name, tone, system_prompt, business_rules, mode, model,
                      auto_confirm_max_total, max_discount_pct, active, onboarding_completed)
  values (
    v_agent,
    v_tenant,
    'Vale',
    'amable',
    $prompt$Eres Vale, la asistente de ventas de Bellisima por WhatsApp. Bellisima es una tienda colombiana de bolsos, carteras, mochilas y accesorios de moda.

Personalidad y tono:
- Eres amable, cercana y servicial. Hablas en español colombiano: usa "hola", "con gusto", "listo", "perfecto", "te cuento".
- Trata al cliente de "tu" o "usted" según cómo te hable; por defecto "tu".
- Mensajes cortos y claros, máximo 3-4 párrafos por respuesta. Usa emojis con moderación (👜, ✨, 💛).
- Nunca inventes productos, precios ni stock. Si no sabes algo, ofrece escalar a una persona del equipo.

Tu objetivo:
1. Entender qué busca el cliente (ocasión, estilo, presupuesto).
2. Recomendar productos del catálogo con nombre, precio y colores disponibles.
3. Informar stock con honestidad: si algo está agotado, ofrece alternativas o avisa cuándo llega.
4. Cerrar la venta: confirmar productos, colores/cantidades, datos de envío y método de pago.
5. Crear el pedido con la herramienta correspondiente y confirmar el resumen al cliente.

Reglas del negocio:
- Precios en pesos colombianos (COP), sin decimales.
- Envío gratis en pedidos desde $150.000. Envío a Bogotá $8.000; otras ciudades entre $12.000 y $15.000 según el destino.
- Entregas en 2-4 días hábiles en ciudades principales; 4-6 días en zonas alejadas.
- Pagos aceptados: contraentrega, Nequi, DaviPlata, Bancolombia, PSE o transferencia.
- Cambios dentro de los 5 días hábiles siguientes a la entrega, con producto sin uso y en empaque original. No hay devoluciones de dinero salvo garantía legal.
- Descuento máximo permitido: 10%, solo cuando el cliente lo negocia con razón válida (ej. compra de varias unidades).
- Pedidos con total mayor a $300.000, reclamos, negociaciones fuertes o dudas fuera del catálogo: escala a un humano (handoff) con un resumen claro.

Cierre de conversación:
- Antes de despedirte, resume el pedido: productos, cantidades, total con envío, dirección y método de pago, y pide confirmación explícita.
- Despedida cálida: "¡Gracias por comprar en Bellisima! 💛 Cualquier cosa me escribes".
$prompt$,
    '{
      "moneda": "COP",
      "envios": {
        "gratis_desde": 150000,
        "bogota": 8000,
        "otras_ciudades_min": 12000,
        "otras_ciudades_max": 15000,
        "tiempo_entrega": "2-4 dias habiles en ciudades principales, 4-6 en zonas alejadas",
        "transportadoras": ["Coordinadora", "Interrapidisimo", "Envia"]
      },
      "pagos": {
        "metodos": ["contraentrega", "nequi", "daviplata", "bancolombia", "pse", "transferencia"],
        "contraentrega_disponible": true,
        "contraentrega_ciudades": ["Bogota", "Medellin", "Cali", "Barranquilla", "Bucaramanga", "Cartagena", "Pereira", "Manizales", "Ibague", "Villavicencio"]
      },
      "cambios_y_devoluciones": {
        "cambios_dias": 5,
        "condiciones": "Producto sin uso, con etiquetas y empaque original. El cliente asume el envio del cambio salvo error nuestro.",
        "devoluciones_dinero": false,
        "garantia_costura_herrajes_dias": 30
      },
      "descuentos": {
        "max_pct": 10,
        "requiere_aprobacion_humana_sobre_pct": 10
      },
      "horario_atencion": "Lunes a sabado 8:00 a.m. - 8:00 p.m., festivos 9:00 a.m. - 5:00 p.m."
    }'::jsonb,
    'shadow',
    'qwen-max',
    300000,
    10,
    true,
    true
  );

  -- ---------- Productos ----------
  insert into products (id, tenant_id, sku, name, description, category, price_retail, price_wholesale, wholesale_min_qty) values
    (v_p01, v_tenant, 'BELL-BOL-001', 'Bolso Tote Cuero',        'Tote amplio en cuero sintético premium con forro interior, bolsillo para celular y cierre superior. Ideal para el día a día y la oficina.', 'Bolsos', 189900, null, null),
    (v_p02, v_tenant, 'BELL-BOL-002', 'Bolso Shoulder Mediano',  'Bolso shoulder de tamaño mediano con correa ajustable y herrajes dorados. Elegante y práctico para salidas casuales.', 'Bolsos', 149900, null, null),
    (v_p03, v_tenant, 'BELL-BOL-003', 'Bolso Hobo Nylon',        'Hobo liviano en nylon impermeable con múltiples compartimientos. Perfecto para clima lluvioso y uso diario.', 'Bolsos', 119900, null, null),
    (v_p04, v_tenant, 'BELL-BOL-004', 'Bolso de Noche Brillante', 'Mini bolso de noche con acabado brillante y cadena desprendible. El complemento perfecto para fiestas y eventos.', 'Bolsos', 99900, null, null),
    (v_p05, v_tenant, 'BELL-CAR-005', 'Cartera Bandolera Cuero', 'Bandolera compacta en cuero con correa larga ajustable y cierre metálico. Lleva lo esencial con estilo.', 'Carteras', 129900, 90930, 6),
    (v_p06, v_tenant, 'BELL-CAR-006', 'Cartera Billetera Larga', 'Billetera larga con 12 tarjeteros, porta monedas con cierre y espacio para celular. Organización total.', 'Carteras', 79900, null, null),
    (v_p07, v_tenant, 'BELL-CAR-007', 'Cartera Porta Chequera',  'Porta chequera clásico con porta documentos y tarjeteros internos. Sobria y funcional.', 'Carteras', 64900, null, null),
    (v_p08, v_tenant, 'BELL-CAR-008', 'Maleta de Mano Viaje',    'Maleta de mano con ruedas 360°, asa telescópica y candado integrado. Cabina de avión (10 kg aprox).', 'Carteras', 289900, null, null),
    (v_p09, v_tenant, 'BELL-BOL-009', 'Bolso Rimowa Grande',     'Bolso grande estilo rimowa, resistente, con base reforzada y gran capacidad. Ideal para viajes cortos y gimnasio.', 'Bolsos', 219900, null, null),
    (v_p10, v_tenant, 'BELL-MOC-010', 'Mochila Urbana Antirrobo', 'Mochila urbana con bolsillo oculto antirrobo, puerto USB y compartimiento acolchado para laptop de 15.6".', 'Mochilas', 99900, null, null),
    (v_p11, v_tenant, 'BELL-MOC-011', 'Mochila Escolar Juvenil', 'Mochila escolar juvenil con estampado de moda, doble compartimiento y bolsillos laterales para botella.', 'Mochilas', 89900, null, null),
    (v_p12, v_tenant, 'BELL-MOC-012', 'Mochila Viajera 40L',     'Mochila viajera de 40 litros con apertura tipo maleta, correas de compresión y material impermeable.', 'Mochilas', 179900, 125930, 6),
    (v_p13, v_tenant, 'BELL-ACC-013', 'Riñonera Deportiva',      'Riñonera deportiva liviana y ajustable, con cierre impermeable. Para correr, montar bici o caminatas.', 'Accesorios', 49900, null, null),
    (v_p14, v_tenant, 'BELL-ACC-014', 'Pañoleta Estampada',      'Pañoleta de 90x90 cm en satín con estampados exclusivos. Úsala en el cuello, el pelo o amarrada a tu bolso.', 'Accesorios', 34900, 24430, 10),
    (v_p15, v_tenant, 'BELL-ACC-015', 'Llavero Pompones',        'Llavero con pompones de hilaza hechos a mano y argolla metálica dorada. Disponible en varios colores.', 'Accesorios', 19900, null, null)
  on conflict (tenant_id, sku) do nothing;

  -- ---------- Variantes ----------
  insert into product_variants (tenant_id, product_id, sku, color, size, stock_qty, image_url) values
    -- BELL-BOL-001 Bolso Tote Cuero
    (v_tenant, v_p01, 'BELL-BOL-001-NGR', 'Negro',  null, 12, '/img/productos/tote-cuero-negro.jpg'),
    (v_tenant, v_p01, 'BELL-BOL-001-CML', 'Camel',  null,  8, '/img/productos/tote-cuero-camel.jpg'),
    (v_tenant, v_p01, 'BELL-BOL-001-VNO', 'Vino',   null,  0, '/img/productos/tote-cuero-vino.jpg'),

    -- BELL-BOL-002 Bolso Shoulder Mediano
    (v_tenant, v_p02, 'BELL-BOL-002-NGR', 'Negro',   null, 10, '/img/productos/shoulder-negro.jpg'),
    (v_tenant, v_p02, 'BELL-BOL-002-BLE', 'Beige',   null,  6, '/img/productos/shoulder-beige.jpg'),
    (v_tenant, v_p02, 'BELL-BOL-002-ROS', 'Rosa',    null,  4, '/img/productos/shoulder-rosa.jpg'),

    -- BELL-BOL-003 Bolso Hobo Nylon
    (v_tenant, v_p03, 'BELL-BOL-003-GRI', 'Gris',    null, 15, '/img/productos/hobo-gris.jpg'),
    (v_tenant, v_p03, 'BELL-BOL-003-AZL', 'Azul',    null,  9, '/img/productos/hobo-azul.jpg'),

    -- BELL-BOL-004 Bolso de Noche Brillante
    (v_tenant, v_p04, 'BELL-BOL-004-DOR', 'Dorado',  null,  7, '/img/productos/noche-dorado.jpg'),
    (v_tenant, v_p04, 'BELL-BOL-004-PLA', 'Plateado', null, 5, '/img/productos/noche-plateado.jpg'),
    (v_tenant, v_p04, 'BELL-BOL-004-NGR', 'Negro',   null,  0, '/img/productos/noche-negro.jpg'),

    -- BELL-CAR-005 Cartera Bandolera Cuero (mayorista)
    (v_tenant, v_p05, 'BELL-CAR-005-NGR', 'Negro',   null, 20, '/img/productos/bandolera-negra.jpg'),
    (v_tenant, v_p05, 'BELL-CAR-005-CML', 'Camel',   null, 14, '/img/productos/bandolera-camel.jpg'),
    (v_tenant, v_p05, 'BELL-CAR-005-VER', 'Verde',   null,  0, '/img/productos/bandolera-verde.jpg'),

    -- BELL-CAR-006 Cartera Billetera Larga
    (v_tenant, v_p06, 'BELL-CAR-006-FUC', 'Fucsia',  null, 11, '/img/productos/billetera-fucsia.jpg'),
    (v_tenant, v_p06, 'BELL-CAR-006-NGR', 'Negro',   null, 18, '/img/productos/billetera-negra.jpg'),

    -- BELL-CAR-007 Cartera Porta Chequera
    (v_tenant, v_p07, 'BELL-CAR-007-MRN', 'Marrón',  null,  9, '/img/productos/porta-chequera-marron.jpg'),
    (v_tenant, v_p07, 'BELL-CAR-007-NGR', 'Negro',   null, 13, '/img/productos/porta-chequera-negro.jpg'),

    -- BELL-CAR-008 Maleta de Mano Viaje
    (v_tenant, v_p08, 'BELL-CAR-008-PQL', 'Rosa pastel', null, 4, '/img/productos/maleta-rosa.jpg'),
    (v_tenant, v_p08, 'BELL-CAR-008-AZL', 'Azul',        null, 6, '/img/productos/maleta-azul.jpg'),
    (v_tenant, v_p08, 'BELL-CAR-008-NGR', 'Negro',       null, 0, '/img/productos/maleta-negra.jpg'),

    -- BELL-BOL-009 Bolso Rimowa Grande
    (v_tenant, v_p09, 'BELL-BOL-009-NGR', 'Negro',   null,  8, '/img/productos/rimowa-negro.jpg'),
    (v_tenant, v_p09, 'BELL-BOL-009-CML', 'Camel',   null,  5, '/img/productos/rimowa-camel.jpg'),
    (v_tenant, v_p09, 'BELL-BOL-009-OLV', 'Oliva',   null,  3, '/img/productos/rimowa-oliva.jpg'),

    -- BELL-MOC-010 Mochila Urbana Antirrobo
    (v_tenant, v_p10, 'BELL-MOC-010-NGR', 'Negro',   null, 22, '/img/productos/mochila-urbana-negra.jpg'),
    (v_tenant, v_p10, 'BELL-MOC-010-GRI', 'Gris',    null, 10, '/img/productos/mochila-urbana-gris.jpg'),

    -- BELL-MOC-011 Mochila Escolar Juvenil
    (v_tenant, v_p11, 'BELL-MOC-011-LIL', 'Lila',    null, 12, '/img/productos/mochila-escolar-lila.jpg'),
    (v_tenant, v_p11, 'BELL-MOC-011-AZL', 'Azul',    null,  8, '/img/productos/mochila-escolar-azul.jpg'),
    (v_tenant, v_p11, 'BELL-MOC-011-NGR', 'Negro',   null,  0, '/img/productos/mochila-escolar-negra.jpg'),

    -- BELL-MOC-012 Mochila Viajera 40L (mayorista)
    (v_tenant, v_p12, 'BELL-MOC-012-NGR', 'Negro',   null, 7, '/img/productos/mochila-viajera-negra.jpg'),
    (v_tenant, v_p12, 'BELL-MOC-012-VER', 'Verde militar', null, 5, '/img/productos/mochila-viajera-verde.jpg'),
    (v_tenant, v_p12, 'BELL-MOC-012-AZL', 'Azul',    null, 0, '/img/productos/mochila-viajera-azul.jpg'),

    -- BELL-ACC-013 Riñonera Deportiva
    (v_tenant, v_p13, 'BELL-ACC-013-NGR', 'Negro',       null, 16, '/img/productos/rinonera-negra.jpg'),
    (v_tenant, v_p13, 'BELL-ACC-013-FLU', 'Verde fluo',  null,  9, '/img/productos/rinonera-fluo.jpg'),
    (v_tenant, v_p13, 'BELL-ACC-013-FUC', 'Fucsia',      null,  7, '/img/productos/rinonera-fucsia.jpg'),

    -- BELL-ACC-014 Pañoleta Estampada (mayorista)
    (v_tenant, v_p14, 'BELL-ACC-014-FLR', 'Floral',       null, 25, '/img/productos/panoleta-floral.jpg'),
    (v_tenant, v_p14, 'BELL-ACC-014-ANI', 'Animal print', null, 18, '/img/productos/panoleta-animal.jpg'),
    (v_tenant, v_p14, 'BELL-ACC-014-LIS', 'Lisa negra',   null,  0, '/img/productos/panoleta-lisa.jpg'),

    -- BELL-ACC-015 Llavero Pompones
    (v_tenant, v_p15, 'BELL-ACC-015-ROS', 'Rosa',    null, 30, '/img/productos/llavero-rosa.jpg'),
    (v_tenant, v_p15, 'BELL-ACC-015-AMA', 'Amarillo', null, 24, '/img/productos/llavero-amarillo.jpg'),
    (v_tenant, v_p15, 'BELL-ACC-015-AZL', 'Azul',    null, 15, '/img/productos/llavero-azul.jpg'),
    (v_tenant, v_p15, 'BELL-ACC-015-NGR', 'Negro',   null,  0, '/img/productos/llavero-negro.jpg')
  on conflict (tenant_id, sku) do nothing;

end $$;

-- ---------- Recordatorio post-seed ----------
-- 1) Crear el usuario en Supabase Auth (Authentication > Add user).
-- 2) Reemplazar el UUID en el bloque tenant_members de este archivo
--    (o ejecutar directamente):
--    insert into tenant_members (tenant_id, user_id, role)
--    select id, 'AQUI_EL_UUID_DEL_USUARIO', 'owner' from tenants where slug = 'bellisima';
