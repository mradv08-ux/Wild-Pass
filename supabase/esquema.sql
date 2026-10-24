-- =====================================================================
--  Wild Pass · The Wild Side
--  Base de datos para Supabase.
--  Cómo usarlo: Supabase > SQL Editor > New query > pega TODO este
--  archivo > Run. Solo hay que hacerlo una vez.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Utilidades
-- ---------------------------------------------------------------------
create or replace function public.madrid_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

create or replace function public.fmt_num(n numeric) returns text
language sql immutable as $$ select replace(to_char(round(n), 'FM999,999,999,990'), ',', '.') $$;

create or replace function public.fmt_eur(n numeric) returns text
language sql immutable as $$
  select case when n = trunc(n) then trunc(n)::text
              else replace(to_char(n, 'FM999990.00'), '.', ',') end || ' €'
$$;

create or replace function public.gen_code(len int) returns text
language plpgsql volatile as $$
declare
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- sin 0/O ni 1/I
  r text := 'WS-';
begin
  for i in 1..len loop
    r := r || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return r;
end $$;

-- ---------------------------------------------------------------------
--  Tablas
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  levels jsonb not null,
  season jsonb not null,
  birthday_bonus int not null default 5000,
  welcome_coupon text not null default 'Primera Aventura: 15% en tu primera actividad',
  contact_name text not null default 'Mister',
  contact_phone text not null default '685 33 05 76',
  contact_email text not null default 'thewildsidebusiness@gmail.com'
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  code text not null unique,
  role text not null default 'client' check (role in ('client', 'staff')),
  balance int not null default 0,
  total int not null default 0,
  since date not null default public.madrid_today(),
  birth date,
  birth_set date,
  birthday_year int,
  level_floor_idx int,
  level_floor_until date,
  onboarded boolean not null default false,
  welcome_given boolean not null default false,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.earn_items (
  id text primary key default 'e' || substr(md5(random()::text), 1, 8),
  kind text not null check (kind in ('actividad', 'evento', 'merch', 'comunidad')),
  name text not null,
  price numeric(8,2) not null default 0 check (price >= 0),
  bonus int not null default 0 check (bonus >= 0),
  counts boolean not null default false,
  note text,
  img text,
  sort int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.rewards (
  id text primary key default 'r' || substr(md5(random()::text), 1, 8),
  name text not null,
  cost int not null check (cost > 0),
  cat text not null default 'Merch',
  min_level int not null default 0,
  img text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.challenges (
  id text primary key default 'c' || substr(md5(random()::text), 1, 8),
  name text not null,
  description text not null default '',
  goal int not null default 1 check (goal > 0),
  track text not null references public.earn_items(id) on delete cascade,
  reward int not null default 0 check (reward >= 0),
  sort int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key default 'v' || substr(md5(random()::text), 1, 8),
  earn_id text references public.earn_items(id) on delete set null,
  title text not null default '',
  day date not null,
  start_time text not null default '10:00',
  place text not null default '',
  spots int not null default 15 check (spots > 0),
  taken int not null default 0 check (taken >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.movements (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  amount int not null,
  day date not null default public.madrid_today(),
  created_at timestamptz not null default now()
);
create index if not exists movements_user_idx on public.movements(user_id, created_at desc);

create table if not exists public.scans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  earn_id text references public.earn_items(id) on delete set null,
  earn_name text not null,
  counts boolean not null default false,
  day date not null default public.madrid_today(),
  staff_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, earn_id, day)
);
create index if not exists scans_user_idx on public.scans(user_id, day);

create table if not exists public.challenge_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id text not null references public.challenges(id) on delete cascade,
  progress int not null default 0,
  primary key (user_id, challenge_id)
);

create table if not exists public.redemptions (
  id bigint generated always as identity primary key,
  code text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  coupon boolean not null default false,
  used boolean not null default false,
  created_day date not null default public.madrid_today(),
  used_day date,
  used_by uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------
--  Quién es del equipo
-- ---------------------------------------------------------------------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'staff')
$$;

-- ---------------------------------------------------------------------
--  Alta automática del pasaporte al registrarse
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  loop
    c := gen_code(5);
    exit when not exists (select 1 from profiles where code = c);
  end loop;
  insert into profiles (id, name, email, code)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 60),
          new.email, c);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
--  Nivel: actividades de los últimos 12 meses (+ nivel mínimo regalado)
-- ---------------------------------------------------------------------
create or replace function public.level_idx(uid uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare n int; lv jsonb; i int := 0; p profiles;
begin
  select levels into lv from settings where id = 1;
  select count(*) into n from scans where user_id = uid and counts and day > madrid_today() - 365;
  for k in 0 .. jsonb_array_length(lv) - 1 loop
    if n >= (lv -> k ->> 'min')::int then i := k; end if;
  end loop;
  select * into p from profiles where id = uid;
  if p.level_floor_idx is not null and p.level_floor_until >= madrid_today() then
    i := greatest(i, least(p.level_floor_idx, jsonb_array_length(lv) - 1));
  end if;
  return i;
end $$;

-- ---------------------------------------------------------------------
--  Sumar Huellas (uso interno: solo lo llaman otras funciones)
-- ---------------------------------------------------------------------
create or replace function public._credit(uid uuid, p_item text, p_level int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it earn_items; mult numeric; v int; nt int; prog int; ch record;
  done jsonb := '[]'::jsonb;
begin
  select * into it from earn_items where id = p_item;
  if not found then raise exception 'Actividad no encontrada'; end if;
  select coalesce((levels -> p_level ->> 'mult')::numeric, 0) into mult from settings where id = 1;
  v := round((it.price * 100 + it.bonus) * (1 + mult / 100));
  insert into movements (user_id, text, amount)
  values (uid, it.name || case when it.price > 0 then ' · ' || fmt_eur(it.price) else '' end, v);
  update profiles set balance = balance + v, total = total + case when it.counts then 1 else 0 end
  where id = uid returning total into nt;

  for ch in select * from challenges where track = p_item loop
    insert into challenge_progress (user_id, challenge_id, progress) values (uid, ch.id, 0)
    on conflict do nothing;
    select progress into prog from challenge_progress
    where user_id = uid and challenge_id = ch.id for update;
    if prog < ch.goal then
      update challenge_progress set progress = prog + 1 where user_id = uid and challenge_id = ch.id;
      if prog + 1 = ch.goal and ch.reward > 0 then
        insert into movements (user_id, text, amount) values (uid, 'Reto: ' || ch.name, ch.reward);
        update profiles set balance = balance + ch.reward where id = uid;
        done := done || jsonb_build_object('name', ch.name, 'reward', ch.reward);
      end if;
    end if;
  end loop;

  return jsonb_build_object('value', v, 'total', nt, 'counts', it.counts,
                            'level_before', p_level, 'level_after', level_idx(uid),
                            'challenges', done);
end $$;

-- ---------------------------------------------------------------------
--  Monitor: escanear a un cliente y sumar Huellas
-- ---------------------------------------------------------------------
create or replace function public.staff_scan(p_code text, p_item text, p_inviter text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m profiles; inv profiles; it earn_items; es_primera boolean; lvl int;
  r jsonb; ri jsonb; nota text := null; codigo text := upper(trim(p_code));
begin
  if not is_staff() then raise exception 'Solo el equipo de The Wild Side puede registrar asistencias'; end if;
  select * into m from profiles where code = codigo;
  if not found then raise exception 'No hay ningún socio con el código %', codigo; end if;
  select * into it from earn_items where id = p_item;
  if not found then raise exception 'Actividad no encontrada'; end if;
  if it.kind = 'comunidad' then raise exception 'Esto no se registra escaneando'; end if;

  es_primera := not exists (select 1 from scans where user_id = m.id);
  lvl := level_idx(m.id);
  begin
    insert into scans (user_id, earn_id, earn_name, counts, staff_id)
    values (m.id, it.id, it.name, it.counts, auth.uid());
  exception when unique_violation then
    raise exception '% ya tiene registrada «%» hoy. No se suman Huellas dos veces.', m.name, it.name;
  end;
  r := _credit(m.id, it.id, lvl);

  if coalesce(trim(p_inviter), '') <> '' then
    select * into inv from profiles where code = upper(trim(p_inviter));
    if not found then
      nota := 'No existe el código de invitación ' || upper(trim(p_inviter)) || '.';
    elsif not es_primera then
      nota := 'La invitación no cuenta: no es su primera actividad.';
    elsif inv.id = m.id then
      nota := 'No puede invitarse a sí mismo.';
    elsif not exists (select 1 from earn_items where id = 'amigo') then
      nota := 'Falta «Traer a un amigo» en el catálogo, así que no se ha sumado nada a quien le invitó.';
    else
      update profiles set invited_by = inv.id where id = m.id;
      ri := _credit(inv.id, 'amigo', level_idx(inv.id));
      nota := inv.name || ' gana ' || fmt_num((ri ->> 'value')::int) || ' Huellas por invitarle.';
    end if;
  end if;

  return r || jsonb_build_object('name', m.name,
                                 'balance', (select balance from profiles where id = m.id),
                                 'avatar', m.avatar,
                                 'note', nota);
end $$;

-- ---------------------------------------------------------------------
--  Cliente: canjear un premio
-- ---------------------------------------------------------------------
create or replace function public.redeem(p_reward text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rw rewards; p profiles; c text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para canjear'; end if;
  select * into rw from rewards where id = p_reward and active;
  if not found then raise exception 'Este premio ya no está disponible'; end if;
  select * into p from profiles where id = auth.uid() for update;
  if level_idx(p.id) < rw.min_level then raise exception 'Este premio se desbloquea en un nivel superior'; end if;
  if p.balance < rw.cost then raise exception 'No tienes Huellas suficientes'; end if;
  loop
    c := gen_code(4);
    exit when not exists (select 1 from redemptions where code = c);
  end loop;
  update profiles set balance = balance - rw.cost where id = p.id;
  insert into movements (user_id, text, amount) values (p.id, 'Canje: ' || rw.name, -rw.cost);
  insert into redemptions (code, user_id, name) values (c, p.id, rw.name);
  return jsonb_build_object('code', c, 'name', rw.name, 'cost', rw.cost);
end $$;

-- ---------------------------------------------------------------------
--  Monitor: validar y entregar un canje
-- ---------------------------------------------------------------------
create or replace function public.staff_validate(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r redemptions; quien text; codigo text := upper(trim(p_code));
begin
  if not is_staff() then raise exception 'Solo el equipo de The Wild Side puede validar canjes'; end if;
  select * into r from redemptions where code = codigo for update;
  if not found then raise exception 'El código % no existe', codigo; end if;
  select name into quien from profiles where id = r.user_id;
  if r.used then
    raise exception 'Este código ya se usó: «%» se entregó a % el %', r.name, quien, to_char(r.used_day, 'DD/MM/YYYY');
  end if;
  update redemptions set used = true, used_day = madrid_today(), used_by = auth.uid() where id = r.id;
  return jsonb_build_object('name', r.name, 'who', quien, 'coupon', r.coupon);
end $$;

-- ---------------------------------------------------------------------
--  Cliente: terminar la bienvenida (cupón + nivel si viene de otra empresa)
-- ---------------------------------------------------------------------
create or replace function public.finish_welcome(p_switch boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles; c text; regalo boolean := false; sube boolean := false;
begin
  select * into p from profiles where id = auth.uid() for update;
  if not found then raise exception 'Inicia sesión'; end if;
  if not p.welcome_given then
    loop
      c := gen_code(4);
      exit when not exists (select 1 from redemptions where code = c);
    end loop;
    insert into redemptions (code, user_id, name, coupon)
    values (c, p.id, (select welcome_coupon from settings where id = 1), true);
    regalo := true;
  end if;
  if p_switch and p.level_floor_idx is null then sube := true; end if;
  update profiles set onboarded = true, welcome_given = true,
         level_floor_idx = case when sube then 1 else level_floor_idx end,
         level_floor_until = case when sube then madrid_today() + 365 else level_floor_until end
  where id = p.id;
  return jsonb_build_object('gift', regalo, 'coupon', c, 'floor', sube);
end $$;

-- ---------------------------------------------------------------------
--  Cliente: perfil
-- ---------------------------------------------------------------------
create or replace function public.update_my_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Escribe tu nombre'; end if;
  update profiles set name = left(trim(p_name), 60) where id = auth.uid();
end $$;

create or replace function public.set_my_birth(p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare actual date;
begin
  select birth into actual from profiles where id = auth.uid();
  if actual is not null then raise exception 'La fecha de nacimiento ya está puesta. Para cambiarla, habla con el equipo.'; end if;
  if p_date is null or p_date > madrid_today() or p_date < date '1900-01-01' then
    raise exception 'Esa fecha no es válida';
  end if;
  update profiles set birth = p_date, birth_set = madrid_today() where id = auth.uid();
end $$;

-- Regalo de cumpleaños: una vez al año y solo si la fecha se puso hace 30 días o más
create or replace function public.claim_birthday() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles; t date := madrid_today(); b int;
begin
  select * into p from profiles where id = auth.uid() for update;
  if not found or p.birth is null then return null; end if;
  if to_char(p.birth, 'MM-DD') = to_char(t, 'MM-DD')
     and coalesce(p.birthday_year, 0) <> extract(year from t)
     and p.birth_set <= t - 30 then
    select birthday_bonus into b from settings where id = 1;
    update profiles set balance = balance + b, birthday_year = extract(year from t) where id = p.id;
    insert into movements (user_id, text, amount) values (p.id, 'Regalo de cumpleaños', b);
    return jsonb_build_object('bonus', b);
  end if;
  return null;
end $$;

-- Caducidad: si pasan 12 meses sin ganar Huellas, el saldo se pone a cero
create or replace function public.check_my_expiry() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles; ultimo date;
begin
  select * into p from profiles where id = auth.uid() for update;
  if not found or p.balance <= 0 then return null; end if;
  select max(day) into ultimo from movements where user_id = p.id and amount > 0;
  ultimo := coalesce(ultimo, p.since);
  if madrid_today() > ultimo + 365 then
    insert into movements (user_id, text, amount)
    values (p.id, 'Huellas caducadas por 12 meses sin actividad', -p.balance);
    update profiles set balance = 0 where id = p.id;
    return jsonb_build_object('expired', p.balance);
  end if;
  return null;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Equipo: corregir la fecha de nacimiento de un cliente
create or replace function public.staff_set_birth(p_code text, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Solo el equipo puede hacer esto'; end if;
  update profiles set birth = p_date, birth_set = madrid_today() where code = upper(trim(p_code));
  if not found then raise exception 'No hay ningún socio con ese código'; end if;
end $$;

-- Equipo: números del programa
create or replace function public.staff_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Solo el equipo puede ver esto'; end if;
  return jsonb_build_object(
    'socios', (select count(*) from profiles where role = 'client'),
    'activos_30', (select count(distinct user_id) from scans where day > madrid_today() - 30),
    'repartidas', (select coalesce(sum(amount), 0) from movements where amount > 0),
    'canjeadas', (select coalesce(-sum(amount), 0) from movements where amount < 0 and text like 'Canje:%'),
    'pendientes', (select count(*) from redemptions where not used),
    'top', (select earn_name from scans where day > madrid_today() - 90
            group by earn_name order by count(*) desc limit 1)
  );
end $$;

-- ---------------------------------------------------------------------
--  Permisos de las funciones
-- ---------------------------------------------------------------------
revoke execute on function public._credit(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.gen_code(int) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.level_idx(uuid) from public, anon;
revoke execute on function public.staff_scan(text, text, text) from public, anon;
revoke execute on function public.redeem(text) from public, anon;
revoke execute on function public.staff_validate(text) from public, anon;
revoke execute on function public.finish_welcome(boolean) from public, anon;
revoke execute on function public.update_my_name(text) from public, anon;
revoke execute on function public.set_my_birth(date) from public, anon;
revoke execute on function public.claim_birthday() from public, anon;
revoke execute on function public.check_my_expiry() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.staff_set_birth(text, date) from public, anon;
revoke execute on function public.staff_stats() from public, anon;
grant execute on function public.level_idx(uuid), public.staff_scan(text, text, text), public.redeem(text),
  public.staff_validate(text), public.finish_welcome(boolean), public.update_my_name(text),
  public.set_my_birth(date), public.claim_birthday(), public.check_my_expiry(),
  public.delete_my_account(), public.staff_set_birth(text, date), public.staff_stats(), public.is_staff()
  to authenticated;

-- Permisos de tablas (las reglas RLS de abajo deciden qué filas ve cada uno)
grant usage on schema public to anon, authenticated;
grant select on public.settings, public.profiles, public.earn_items, public.rewards, public.challenges,
  public.events, public.movements, public.scans, public.challenge_progress, public.redemptions to authenticated;
grant update on public.settings to authenticated;
grant insert, update, delete on public.earn_items, public.rewards, public.challenges, public.events to authenticated;

-- ---------------------------------------------------------------------
--  Reglas de acceso (RLS): cada cliente ve solo lo suyo
-- ---------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.earn_items enable row level security;
alter table public.rewards enable row level security;
alter table public.challenges enable row level security;
alter table public.events enable row level security;
alter table public.movements enable row level security;
alter table public.scans enable row level security;
alter table public.challenge_progress enable row level security;
alter table public.redemptions enable row level security;

-- Catálogo: lo ve cualquiera con sesión; solo el equipo lo cambia
drop policy if exists "leer ajustes" on public.settings;
create policy "leer ajustes" on public.settings for select to authenticated using (true);
drop policy if exists "equipo cambia ajustes" on public.settings;
create policy "equipo cambia ajustes" on public.settings for update to authenticated using (is_staff()) with check (is_staff());

do $$
declare t text;
begin
  foreach t in array array['earn_items', 'rewards', 'challenges', 'events'] loop
    execute format('drop policy if exists "leer catalogo" on public.%I', t);
    execute format('create policy "leer catalogo" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "equipo cambia catalogo" on public.%I', t);
    execute format('create policy "equipo cambia catalogo" on public.%I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

-- Datos de cada socio: solo los suyos (el equipo ve todos). Nadie los escribe directamente.
drop policy if exists "mi perfil" on public.profiles;
create policy "mi perfil" on public.profiles for select to authenticated using (id = auth.uid() or is_staff());

do $$
declare t text;
begin
  foreach t in array array['movements', 'scans', 'challenge_progress', 'redemptions'] loop
    execute format('drop policy if exists "lo mio" on public.%I', t);
    execute format('create policy "lo mio" on public.%I for select to authenticated using (user_id = auth.uid() or is_staff())', t);
  end loop;
end $$;

-- Avisos en directo cuando el monitor te suma Huellas
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.movements;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Datos iniciales (catálogo con los precios de tu web)
-- ---------------------------------------------------------------------
insert into public.settings (id, levels, season) values (1,
  '[{"name":"Huella","min":0,"mult":0,"perk":"Regalo de bienvenida y Huellas por todo"},
    {"name":"Sendero","min":3,"mult":10,"perk":"+10% Huellas y aviso anticipado de eventos"},
    {"name":"Cumbre","min":6,"mult":25,"perk":"+25% Huellas y reserva anticipada"},
    {"name":"Salvaje","min":10,"mult":50,"perk":"+50% Huellas y experiencia exclusiva anual"}]',
  '{"tag":"Halloween 2026 · San Juan del Puerto","title":"El Pasaje del Terror","text":"No estás solo... te quieren. Completa el reto de temporada y llévate 8.000 Huellas extra.","img":"img/pasaje-banner.jpg"}')
on conflict (id) do nothing;

insert into public.earn_items (id, kind, name, price, bonus, counts, note, img, sort) values
  ('senderismo', 'actividad', 'Senderismo', 20, 2000, true, 'Desde 15 € en grupos de más de 15', 'img/senderismo.jpg', 10),
  ('escalada', 'actividad', 'Escalada', 40, 2000, true, '25 € en grupos de 15 o más', 'img/escalada.jpg', 20),
  ('acampada', 'actividad', 'Acampada (2 noches)', 50, 3000, true, 'Precio desde, por persona', 'img/acampada.jpg', 30),
  ('cumple', 'actividad', 'Animación de cumpleaños o comunión', 100, 2000, true, 'Por hora, hasta 50 niños', 'img/cumple.jpg', 40),
  ('adultos', 'actividad', 'Animación para adultos', 75, 2000, true, 'Por hora, mayores de 18', 'img/adultos.jpg', 50),
  ('pasaje', 'evento', 'Pasaje del terror', 0, 1000, true, 'Precio por confirmar', 'img/pasaje.jpg', 60),
  ('mercadillo', 'evento', 'Juego del mercadillo navideño', 0, 1000, false, null, null, 70),
  ('sudadera', 'merch', 'Sudadera TWS', 30, 0, false, null, 'img/sudadera.jpg', 80),
  ('camiseta', 'merch', 'Camiseta TWS', 15, 0, false, null, 'img/camiseta.jpg', 81),
  ('taza', 'merch', 'Taza TWS', 9, 0, false, null, 'img/taza.jpg', 82),
  ('mochila', 'merch', 'Mochila de tela', 8.5, 0, false, null, 'img/mochila.jpg', 83),
  ('pulsera', 'merch', 'Pulsera de tela', 2, 0, false, null, 'img/pulsera.jpg', 84),
  ('iman', 'merch', 'Imán TWS', 2, 0, false, null, 'img/iman.jpg', 85),
  ('amigo', 'comunidad', 'Traer a un amigo', 0, 10000, false, 'Cuando tu amigo hace su primera actividad', null, 90)
on conflict (id) do nothing;

insert into public.rewards (id, name, cost, cat, min_level, img) values
  ('r-pulsera', 'Pulsera de tela', 15000, 'Merch', 0, 'img/pulsera.jpg'),
  ('r-iman', 'Imán TWS', 15000, 'Merch', 0, 'img/iman.jpg'),
  ('r-descuento', 'Descuento de 5 € en una actividad', 25000, 'Premio rápido', 0, null),
  ('r-mochila', 'Mochila de tela', 40000, 'Merch', 0, 'img/mochila.jpg'),
  ('r-reserva', 'Reserva anticipada del pasaje del terror', 40000, 'Prioridad', 2, 'img/pasaje.jpg'),
  ('r-taza', 'Taza TWS', 45000, 'Merch', 0, 'img/taza.jpg'),
  ('r-camiseta', 'Camiseta TWS', 70000, 'Merch', 0, 'img/camiseta.jpg'),
  ('r-acompanante', 'Plaza gratis de senderismo para un acompañante', 90000, 'Actividades', 1, 'img/senderismo.jpg'),
  ('r-sudadera', 'Sudadera TWS', 140000, 'Merch', 0, 'img/sudadera.jpg'),
  ('r-nocturna', 'Acampada nocturna solo para socios', 150000, 'Experiencia', 3, 'img/acampada.jpg')
on conflict (id) do nothing;

insert into public.challenges (id, name, description, goal, track, reward, sort) values
  ('c-pasaje', 'Sobrevive al pasaje', 'Sal con vida del pasaje del terror esta temporada', 1, 'pasaje', 8000, 10),
  ('c-acampada', 'Prueba algo nuevo', 'Haz una acampada con nosotros', 1, 'acampada', 3000, 20),
  ('c-manada', 'Trae a tu manada', 'Invita a un amigo y que haga su primera actividad', 1, 'amigo', 2000, 30)
on conflict (id) do nothing;


-- Ajustes de seguridad recomendados por el revisor de Supabase
alter function public.madrid_today() set search_path = public;
alter function public.fmt_num(numeric) set search_path = public;
alter function public.fmt_eur(numeric) set search_path = public;
alter function public.gen_code(int) set search_path = public;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
revoke execute on function public.level_idx(uuid) from authenticated;


-- ---------------------------------------------------------------------
--  Jefe y monitores: los monitores registran asistencias y entregan
--  premios; solo el jefe cambia el catálogo y ve los datos de clientes.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists admin boolean not null default false;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'staff' and admin)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter policy "equipo cambia ajustes" on public.settings using (is_admin()) with check (is_admin());
alter policy "equipo cambia catalogo" on public.earn_items using (is_admin()) with check (is_admin());
alter policy "equipo cambia catalogo" on public.rewards using (is_admin()) with check (is_admin());
alter policy "equipo cambia catalogo" on public.challenges using (is_admin()) with check (is_admin());
alter policy "equipo cambia catalogo" on public.events using (is_admin()) with check (is_admin());
alter policy "mi perfil" on public.profiles using (id = auth.uid() or is_admin());
alter policy "lo mio" on public.movements using (user_id = auth.uid() or is_admin());
alter policy "lo mio" on public.scans using (user_id = auth.uid() or is_admin());
alter policy "lo mio" on public.challenge_progress using (user_id = auth.uid() or is_admin());
alter policy "lo mio" on public.redemptions using (user_id = auth.uid() or is_admin());

create or replace function public.staff_set_birth(p_code text, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el jefe puede hacer esto'; end if;
  update profiles set birth = p_date, birth_set = madrid_today() where code = upper(trim(p_code));
  if not found then raise exception 'No hay ningún socio con ese código'; end if;
end $$;

create or replace function public.staff_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Solo el jefe puede ver esto'; end if;
  return jsonb_build_object(
    'socios', (select count(*) from profiles where role = 'client'),
    'activos_30', (select count(distinct user_id) from scans where day > madrid_today() - 30),
    'repartidas', (select coalesce(sum(amount), 0) from movements where amount > 0),
    'canjeadas', (select coalesce(-sum(amount), 0) from movements where amount < 0 and text like 'Canje:%'),
    'pendientes', (select count(*) from redemptions where not used),
    'top', (select earn_name from scans where day > madrid_today() - 90
            group by earn_name order by count(*) desc limit 1)
  );
end $$;

create or replace function public.admin_set_role(p_code text, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if not is_admin() then raise exception 'Solo el jefe puede gestionar el equipo'; end if;
  if p_role not in ('client', 'staff') then raise exception 'Acceso no válido'; end if;
  update profiles set role = p_role where code = upper(trim(p_code)) and not admin returning name into n;
  if n is null then raise exception 'No hay ningún socio con el código % (o es el jefe)', upper(trim(p_code)); end if;
  return jsonb_build_object('name', n, 'role', p_role);
end $$;
revoke execute on function public.admin_set_role(text, text) from public, anon;
grant execute on function public.admin_set_role(text, text) to authenticated;


-- ---------------------------------------------------------------------
--  Foto de perfil (pequeña, en la propia base de datos) y bienvenida
--  sin «vengo de otra empresa»
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists avatar text;

create or replace function public.set_my_avatar(p_img text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if p_img is not null and (p_img not like 'data:image/jpeg;base64,%' or length(p_img) > 80000) then
    raise exception 'La foto no es válida o es demasiado grande';
  end if;
  update profiles set avatar = p_img where id = auth.uid();
end $$;
revoke execute on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

create or replace function public.finish_welcome(p_switch boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles; c text; regalo boolean := false;
begin
  select * into p from profiles where id = auth.uid() for update;
  if not found then raise exception 'Inicia sesión'; end if;
  if not p.welcome_given then
    loop
      c := gen_code(4);
      exit when not exists (select 1 from redemptions where code = c);
    end loop;
    insert into redemptions (code, user_id, name, coupon)
    values (c, p.id, (select welcome_coupon from settings where id = 1), true);
    regalo := true;
  end if;
  update profiles set onboarded = true, welcome_given = true where id = p.id;
  return jsonb_build_object('gift', regalo, 'coupon', c, 'floor', false);
end $$;
-- (staff_scan devuelve además 'avatar' para que el monitor vea la foto del cliente;
--  ver la versión aplicada en el proyecto «wild_pass_8_foto_perfil_sin_otra_empresa».)

-- =====================================================================
--  Para hacerte JEFE, regístrate primero en la app y después ejecuta
--  esto cambiando el email (solo una vez):
--
--  update public.profiles set role = 'staff', admin = true where email = 'tu-email@ejemplo.com';
--
--  Los monitores se gestionan desde la app: Equipo › Tu equipo.
-- =====================================================================

-- v9: cartel opcional por fecha de la agenda
alter table public.events add column if not exists img text;
