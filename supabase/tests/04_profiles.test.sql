-- Spec 041, FR-013: profiles are user-owned. A user updates only their own profile and sees only
-- their own and those of people who share a studio with them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create schema t041;
grant usage on schema t041 to authenticated;

create function t041.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function t041.affected(dml text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('with x as (%s returning 1) select count(*) from x', dml) into n; return n;
exception when insufficient_privilege then return 0;
end $$;

grant execute on all functions in schema t041 to authenticated;

select t041.act_as('a3000000-0000-4000-8000-000000000003');  -- designer.a

select is(t041.affected($$update public.profiles set full_name = 'Renamed Designer'
                          where id = 'a3000000-0000-4000-8000-000000000003'$$), 1::bigint,
          'a user can update their own profile');
select is(t041.affected($$update public.profiles set full_name = 'Hijacked'
                          where id = 'a1000000-0000-4000-8000-000000000001'$$), 0::bigint,
          'a user cannot update a co-member''s profile');
select is(t041.affected($$update public.profiles set full_name = 'Hijacked'
                          where id = 'b3000000-0000-4000-8000-000000000003'$$), 0::bigint,
          'a user cannot update another studio member''s profile');
select is((select count(*) from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'), 1::bigint,
          'a user sees a co-member''s profile');
select is((select count(*) from public.profiles where id = 'b3000000-0000-4000-8000-000000000003'), 0::bigint,
          'a user does not see another studio''s members');
select is((select count(*) from public.profiles where id = 'c0000000-0000-4000-8000-000000000000'), 0::bigint,
          'a user does not see a stranger''s profile');
select is(t041.affected($$delete from public.profiles where id = 'a3000000-0000-4000-8000-000000000003'$$), 0::bigint,
          'a user cannot delete their own profile');

select t041.act_as('c0000000-0000-4000-8000-000000000000');  -- stranger, in no studio
select is((select count(*) from public.profiles), 1::bigint,
          'a user in no studio sees only their own profile');

reset role;
select * from finish();
rollback;
