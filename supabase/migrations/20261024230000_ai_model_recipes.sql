-- AI modeler now uses Gemini recipes built in the browser (fal.ai removed). Keep the recipe with
-- the saved model so it can be refined later or rebuilt by a Blender worker.
alter table public.catalog_models add column if not exists recipe jsonb;
comment on column public.catalog_models.recipe is 'Furniture recipe (shaped parts + materials) the model was built from, for AI-made models.';
