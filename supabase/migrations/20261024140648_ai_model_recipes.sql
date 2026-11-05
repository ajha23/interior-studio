alter table public.catalog_models add column if not exists recipe jsonb;
comment on column public.catalog_models.recipe is 'Furniture recipe (shaped parts + materials) the model was built from, for AI-made models.';;
