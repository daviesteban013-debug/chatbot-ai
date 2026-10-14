begin;
-- Catalog editing and AI import. Browsers keep read-only access (20261013193256);
-- every write goes through these owner/agent RPCs executed by the server.

alter table public.products
  add column image_url text,
  add column updated_at timestamptz not null default now();

-- Public bucket: WhatsApp fetches product photos by HTTPS link. Only the server uploads.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit)
      values ('product-images','product-images',true,5242880)
      on conflict (id) do update set public = true, file_size_limit = 5242880;
  end if;
end $$;

-- SKU-safe slug: accents removed, uppercase, letters/digits separated by dashes.
create function public.nexo_catalog_slug(p_value text, p_max integer default 24)
returns text language sql immutable set search_path='' as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(
    upper(translate(coalesce(p_value,''),'áéíóúàèìòùäëïöüñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑÇ','aeiouaeiouaeiouncAEIOUAEIOUAEIOUNC')),
    '[^A-Z0-9]+','-','g')),p_max),''),'ITEM');
$$;

-- First free SKU for this business, starting from p_base (products and variants are separate namespaces).
create function public.nexo_catalog_free_sku(p_tenant uuid, p_base text, p_variant boolean)
returns text language plpgsql set search_path='' as $$
declare v_sku text := p_base; n integer := 1;
begin
  loop
    if p_variant then
      exit when not exists(select 1 from public.product_variants where tenant_id=p_tenant and sku=v_sku);
    else
      exit when not exists(select 1 from public.products where tenant_id=p_tenant and sku=v_sku);
    end if;
    n := n + 1; v_sku := left(p_base,40) || '-' || n;
  end loop;
  return v_sku;
end; $$;

-- Internal: validates and writes one product with its variants. Not exposed to any API role.
-- p_match: 'id' (editor), 'merge' (import updates existing), 'only_new' (import skips existing).
-- Keys missing from p_product keep their stored value on updates.
create function public.nexo_catalog_upsert(p_tenant uuid, p_product jsonb, p_match text, p_replace_variants boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  p public.products; v public.product_variants; item jsonb;
  v_found boolean := false; v_created boolean := false;
  v_name text := nullif(trim(p_product->>'name'),'');
  v_sku text := nullif(upper(trim(p_product->>'sku')),'');
  v_price bigint; v_wholesale bigint; v_min bigint; v_stock bigint; v_override bigint;
  v_image text; v_keep uuid[] := '{}'; v_variant_sku text; v_color text; v_size text; v_count integer := 0;
begin
  if jsonb_typeof(p_product) <> 'object' then raise exception 'catalog_invalid'; end if;
  if p_product ? 'name' and (v_name is null or length(v_name) > 160) then raise exception 'catalog_invalid_name'; end if;
  if v_sku is not null and (length(v_sku) > 60 or v_sku !~ '^[A-Z0-9][A-Z0-9._-]*$') then raise exception 'catalog_invalid_sku'; end if;
  if p_product ? 'price_retail' then
    if jsonb_typeof(p_product->'price_retail') <> 'number' then raise exception 'catalog_invalid_price'; end if;
    v_price := (p_product->>'price_retail')::numeric;
    if v_price < 0 or v_price > 1000000000 or (p_product->>'price_retail')::numeric <> v_price then raise exception 'catalog_invalid_price'; end if;
  end if;
  if jsonb_typeof(p_product->'price_wholesale') = 'number' then
    v_wholesale := (p_product->>'price_wholesale')::numeric;
    if v_wholesale < 0 or v_wholesale > 1000000000 then raise exception 'catalog_invalid_price'; end if;
  end if;
  if jsonb_typeof(p_product->'wholesale_min_qty') = 'number' then
    v_min := (p_product->>'wholesale_min_qty')::numeric;
    if v_min < 1 or v_min > 1000000 then raise exception 'catalog_invalid_price'; end if;
  end if;
  if length(p_product->>'description') > 2000 or length(p_product->>'category') > 60 then raise exception 'catalog_invalid'; end if;
  v_image := nullif(trim(p_product->>'image_url'),'');
  if v_image is not null and (length(v_image) > 1000 or v_image !~ '^https://') then raise exception 'catalog_invalid_image'; end if;
  if p_product ? 'variants' and (jsonb_typeof(p_product->'variants') <> 'array' or jsonb_array_length(p_product->'variants') > 100) then
    raise exception 'catalog_invalid_variants';
  end if;

  -- Find the product this payload refers to.
  if p_match = 'id' and p_product ? 'id' then
    select * into p from public.products where id=(p_product->>'id')::uuid and tenant_id=p_tenant for update;
    if not found then raise exception 'catalog_not_found'; end if;
    v_found := true;
  elsif p_match in ('merge','only_new') then
    if v_sku is not null then
      select * into p from public.products where tenant_id=p_tenant and sku=v_sku for update;
    elsif v_name is not null then
      select * into p from public.products where tenant_id=p_tenant and lower(name)=lower(v_name) order by created_at limit 1 for update;
    end if;
    v_found := found;
    if v_found and p_match = 'only_new' then
      return jsonb_build_object('id',p.id,'sku',p.sku,'status','skipped','reason','exists');
    end if;
  end if;
  if v_sku is not null and exists(select 1 from public.products where tenant_id=p_tenant and sku=v_sku and (not v_found or id<>p.id)) then
    raise exception 'catalog_sku_taken';
  end if;

  if v_found then
    update public.products set
      name=coalesce(v_name,name),
      sku=coalesce(v_sku,sku),
      description=case when p_product ? 'description' then nullif(trim(p_product->>'description'),'') else description end,
      category=case when p_product ? 'category' then nullif(trim(p_product->>'category'),'') else category end,
      price_retail=coalesce(v_price,price_retail),
      price_wholesale=case when p_product ? 'price_wholesale' then v_wholesale else price_wholesale end,
      wholesale_min_qty=case when p_product ? 'wholesale_min_qty' then v_min else wholesale_min_qty end,
      image_url=case when p_product ? 'image_url' then v_image else image_url end,
      active=case when jsonb_typeof(p_product->'active')='boolean' then (p_product->>'active')::boolean else active end,
      updated_at=now()
      where id=p.id returning * into p;
  else
    if v_name is null then raise exception 'catalog_invalid_name'; end if;
    if v_price is null then raise exception 'catalog_invalid_price'; end if;
    insert into public.products(tenant_id,sku,name,description,category,price_retail,price_wholesale,wholesale_min_qty,image_url,active)
      values(p_tenant,coalesce(v_sku,public.nexo_catalog_free_sku(p_tenant,public.nexo_catalog_slug(v_name),false)),v_name,
        nullif(trim(p_product->>'description'),''),nullif(trim(p_product->>'category'),''),v_price,v_wholesale,v_min,v_image,
        coalesce((p_product->>'active')::boolean,true))
      returning * into p;
    v_created := true;
  end if;

  -- Variants: matched by id, then SKU, then color+size within this product.
  for item in select * from jsonb_array_elements(coalesce(p_product->'variants','[]'::jsonb)) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'catalog_invalid_variants'; end if;
    v_color := nullif(trim(item->>'color'),''); v_size := nullif(trim(item->>'size'),'');
    v_variant_sku := nullif(upper(trim(item->>'sku')),'');
    if length(v_color) > 40 or length(v_size) > 40 then raise exception 'catalog_invalid_variants'; end if;
    if v_variant_sku is not null and (length(v_variant_sku) > 60 or v_variant_sku !~ '^[A-Z0-9][A-Z0-9._-]*$') then raise exception 'catalog_invalid_sku'; end if;
    v_stock := null; v_override := null;
    if item ? 'stock_qty' then
      if jsonb_typeof(item->'stock_qty') <> 'number' then raise exception 'catalog_invalid_stock'; end if;
      v_stock := (item->>'stock_qty')::numeric;
      if v_stock < 0 or v_stock > 10000000 then raise exception 'catalog_invalid_stock'; end if;
    end if;
    if jsonb_typeof(item->'price_override') = 'number' then
      v_override := (item->>'price_override')::numeric;
      if v_override < 0 or v_override > 1000000000 then raise exception 'catalog_invalid_price'; end if;
    end if;
    if nullif(trim(item->>'image_url'),'') is not null and (length(item->>'image_url') > 1000 or item->>'image_url' !~ '^https://') then
      raise exception 'catalog_invalid_image';
    end if;

    v := null;
    if item ? 'id' then
      select * into v from public.product_variants where id=(item->>'id')::uuid and product_id=p.id and tenant_id=p_tenant for update;
      if not found then raise exception 'catalog_not_found'; end if;
    elsif v_variant_sku is not null then
      select * into v from public.product_variants where tenant_id=p_tenant and sku=v_variant_sku for update;
      if found and v.product_id<>p.id then raise exception 'catalog_sku_taken'; end if;
    else
      select * into v from public.product_variants where product_id=p.id and tenant_id=p_tenant
        and lower(coalesce(color,''))=lower(coalesce(v_color,'')) and lower(coalesce(size,''))=lower(coalesce(v_size,''))
        and not (id = any(v_keep)) order by active desc limit 1 for update;
    end if;

    if v.id is not null then
      if v_variant_sku is not null and exists(select 1 from public.product_variants where tenant_id=p_tenant and sku=v_variant_sku and id<>v.id) then
        raise exception 'catalog_sku_taken';
      end if;
      if v_stock is not null and v_stock < v.reserved_qty then raise exception 'catalog_stock_below_reserved'; end if;
      update public.product_variants set
        sku=coalesce(v_variant_sku,sku),
        color=case when item ? 'color' then v_color else color end,
        size=case when item ? 'size' then v_size else size end,
        price_override=case when item ? 'price_override' then v_override else price_override end,
        stock_qty=coalesce(v_stock,stock_qty),
        image_url=case when item ? 'image_url' then nullif(trim(item->>'image_url'),'') else image_url end,
        active=case when jsonb_typeof(item->'active')='boolean' then (item->>'active')::boolean else true end
        where id=v.id returning * into v;
    else
      insert into public.product_variants(tenant_id,product_id,sku,color,size,price_override,stock_qty,image_url,active)
        values(p_tenant,p.id,coalesce(v_variant_sku,public.nexo_catalog_free_sku(p_tenant,
            p.sku || case when v_color is null and v_size is null then '' else '-' || public.nexo_catalog_slug(concat_ws('-',v_color,v_size),16) end,true)),
          v_color,v_size,v_override,coalesce(v_stock,0),nullif(trim(item->>'image_url'),''),
          coalesce((item->>'active')::boolean,true))
        returning * into v;
    end if;
    v_keep := v_keep || v.id; v_count := v_count + 1;
  end loop;

  -- The editor sends the full list: variants it removed are deleted, or archived if already sold.
  if p_replace_variants then
    delete from public.product_variants pv where pv.product_id=p.id and pv.tenant_id=p_tenant and not (pv.id = any(v_keep))
      and pv.reserved_qty=0 and not exists(select 1 from public.order_items oi where oi.variant_id=pv.id);
    update public.product_variants set active=false where product_id=p.id and tenant_id=p_tenant and not (id = any(v_keep));
  end if;
  -- Every product needs one sellable variant.
  if not exists(select 1 from public.product_variants where product_id=p.id and tenant_id=p_tenant) then
    insert into public.product_variants(tenant_id,product_id,sku,stock_qty)
      values(p_tenant,p.id,public.nexo_catalog_free_sku(p_tenant,p.sku,true),0);
  end if;
  return jsonb_build_object('id',p.id,'sku',p.sku,'status',case when v_created then 'created' else 'updated' end,'variants',v_count);
end; $$;

create function public.nexo_catalog_require_editor(p_tenant uuid, p_user uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'catalog_forbidden'; end if;
end; $$;

create function public.nexo_save_product(p_tenant uuid, p_user uuid, p_product jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform public.nexo_catalog_require_editor(p_tenant,p_user);
  return public.nexo_catalog_upsert(p_tenant,p_product,'id',true);
end; $$;

-- Imports up to 500 reviewed products. Each product is applied on its own: one invalid
-- row is reported and skipped without undoing the others.
create function public.nexo_import_products(p_tenant uuid, p_user uuid, p_products jsonb, p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; result jsonb; results jsonb := '[]'::jsonb; i integer := 0;
  v_created integer := 0; v_updated integer := 0; v_skipped integer := 0;
begin
  perform public.nexo_catalog_require_editor(p_tenant,p_user);
  if p_mode not in ('merge','only_new') then raise exception 'catalog_invalid'; end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 or jsonb_array_length(p_products) > 500 then
    raise exception 'catalog_invalid';
  end if;
  for item in select * from jsonb_array_elements(p_products) loop
    begin
      result := public.nexo_catalog_upsert(p_tenant,item - 'id',p_mode,false);
    exception when others then
      result := jsonb_build_object('status','skipped','reason',
        case when sqlerrm like 'catalog\_%' then sqlerrm else 'catalog_invalid' end);
    end;
    if result->>'status'='created' then v_created := v_created + 1;
    elsif result->>'status'='updated' then v_updated := v_updated + 1;
    else v_skipped := v_skipped + 1; end if;
    results := results || jsonb_build_array(jsonb_build_object('index',i) || result);
    i := i + 1;
  end loop;
  return jsonb_build_object('created',v_created,'updated',v_updated,'skipped',v_skipped,'results',results);
end; $$;

-- Deletes a product that was never sold; otherwise archives it so order history stays valid.
create function public.nexo_archive_product(p_tenant uuid, p_user uuid, p_product uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform public.nexo_catalog_require_editor(p_tenant,p_user);
  perform 1 from public.products where id=p_product and tenant_id=p_tenant for update;
  if not found then raise exception 'catalog_not_found'; end if;
  if exists(select 1 from public.order_items oi join public.product_variants pv on pv.id=oi.variant_id where pv.product_id=p_product)
    or exists(select 1 from public.product_variants where product_id=p_product and reserved_qty>0) then
    update public.products set active=false, updated_at=now() where id=p_product;
    update public.product_variants set active=false where product_id=p_product;
    return jsonb_build_object('status','archived');
  end if;
  delete from public.products where id=p_product;
  return jsonb_build_object('status','deleted');
end; $$;

revoke all on function public.nexo_catalog_slug(text,integer), public.nexo_catalog_free_sku(uuid,text,boolean),
  public.nexo_catalog_upsert(uuid,jsonb,text,boolean), public.nexo_catalog_require_editor(uuid,uuid),
  public.nexo_save_product(uuid,uuid,jsonb), public.nexo_import_products(uuid,uuid,jsonb,text),
  public.nexo_archive_product(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.nexo_catalog_slug(text,integer), public.nexo_catalog_free_sku(uuid,text,boolean),
  public.nexo_catalog_upsert(uuid,jsonb,text,boolean), public.nexo_catalog_require_editor(uuid,uuid),
  public.nexo_save_product(uuid,uuid,jsonb), public.nexo_import_products(uuid,uuid,jsonb,text),
  public.nexo_archive_product(uuid,uuid,uuid) to service_role;
commit;
