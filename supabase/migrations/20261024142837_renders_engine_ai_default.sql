create or replace function private.renders_engine_default() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kind = 'ai' then new.engine := 'ai'; end if;
  return new;
end $$;
create trigger renders_engine_default before insert on public.renders for each row execute function private.renders_engine_default();;
