-- Phase 2.3–2.4: 360° panoramas and lighting presets on renders.
alter table public.renders add column kind text not null default 'still' check (kind in ('still', 'panorama'));
alter table public.renders drop constraint renders_mood_check;
update public.renders set mood = 'daylight' where mood = 'day';
alter table public.renders alter column mood set default 'daylight';
alter table public.renders add constraint renders_mood_check check (mood in ('daylight', 'golden', 'overcast', 'evening', 'night'));
