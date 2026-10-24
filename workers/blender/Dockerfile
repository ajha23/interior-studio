# Interior Studio Blender worker: Blender 4.5 LTS as a Python module (bpy) + a small HTTP server.
FROM python:3.11-slim-bookworm

# Shared libraries bpy links against even when rendering headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libx11-6 libxext6 libxrender1 libxxf86vm1 libxfixes3 libxi6 libxkbcommon0 libsm6 libice6 \
      libgl1 libegl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir bpy==4.5.3

WORKDIR /app
COPY server.py render_scene.py build_recipe.py ./
# Fail the build early if Blender can't start in this image.
RUN python -c "import bpy; print('Blender', bpy.app.version_string)"

ENV PYTHONUNBUFFERED=1 PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]
