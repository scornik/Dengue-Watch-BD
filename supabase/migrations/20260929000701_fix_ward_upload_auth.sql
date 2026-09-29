-- Security fix: upsert_wards_geojson is security definer, where current_user is
-- the function owner, so is_end_user_context() was always false and any signed-in
-- user could load ward boundaries. Check the JWT user instead.
create or replace function public.upsert_wards_geojson(p_fc jsonb, p_source text default 'manual')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  f jsonb;
  v_corp public.city_corp;
  v_no integer;
  v_geom extensions.geometry;
  n integer := 0;
begin
  -- Definer function: current_user is the owner here, so decide by the JWT user.
  if (select auth.uid()) is not null and not public.has_role('superadmin', 'ward_admin') then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  for f in select * from jsonb_array_elements(p_fc -> 'features') loop
    v_corp := upper(f -> 'properties' ->> 'city_corp')::public.city_corp;
    v_no := (f -> 'properties' ->> 'ward_no')::integer;
    if (select auth.uid()) is not null and public.current_app_role() = 'ward_admin'
       and v_corp <> public.current_city_corp() then
      raise exception 'ward admins can only load their own city corporation' using errcode = '42501';
    end if;
    v_geom := extensions.st_multi(extensions.st_makevalid(
      extensions.st_setsrid(extensions.st_geomfromgeojson((f -> 'geometry')::text), 4326)));
    v_geom := extensions.st_multi(extensions.st_collectionextract(v_geom, 3));
    insert into public.wards (id, city_corp, ward_no, name_bn, name_en, geom, geom_source)
    values (
      case v_corp when 'DNCC' then v_no else 100 + v_no end,
      v_corp, v_no,
      coalesce(f -> 'properties' ->> 'name_bn', 'ওয়ার্ড ' || v_no),
      coalesce(f -> 'properties' ->> 'name_en', 'Ward ' || v_no),
      v_geom, p_source)
    on conflict (city_corp, ward_no) do update
      set geom = excluded.geom,
          geom_source = excluded.geom_source,
          name_bn = coalesce(f -> 'properties' ->> 'name_bn', public.wards.name_bn),
          name_en = coalesce(f -> 'properties' ->> 'name_en', public.wards.name_en),
          updated_at = now();
    n := n + 1;
  end loop;

  -- Backfill ward on reports/sites that were outside every known polygon.
  update public.reports r set ward_id = w.id
    from public.wards w
    where r.ward_id is null and w.geom is not null and extensions.st_contains(w.geom, r.geom);
  update public.sites s set ward_id = w.id
    from public.wards w
    where s.ward_id is null and w.geom is not null and extensions.st_contains(w.geom, s.geom);
  return n;
end;
$$;
