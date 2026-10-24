-- Phase 2.1: remember which format a studio model was converted from.
alter table public.catalog_models add column source_format text not null default 'glb'
  check (source_format in ('glb', 'gltf', 'fbx', 'obj', 'dae', '3ds', 'stl', 'ply', '3mf', 'ai'));
