# Realistic look, references and acting in the space

Research and decisions: October 2026 (sources at the end). Three features make the design look and
behave like the real room: realistic rendering, design from reference photos/video, and an assistant
that can act in the space like a person.

## 1. Realistic rendering

| Layer | What it does | Where |
| --- | --- | --- |
| Textured finishes | Wood, planks, marble, tile, terrazzo, concrete, plaster, stone, fabric, brick — drawn in the browser as seamless 512 px tiles tinted by the finish colour, with matching roughness and normal maps. No downloads, no licences. | `src/rendering/materials/textures.ts` |
| Real-size mapping | UVs are rewritten in metres per face, so a 180 mm plank or a 600 mm tile has the same size on every part. | `src/rendering/materials/worldUVs.tsx` |
| Light | Image-based light from three.js `RoomEnvironment` (generated on the GPU), a warm sun with soft shadows, AgX tone mapping. Metals and glass reflect the room. | `src/rendering/scene/Lighting.tsx` |
| Ambient occlusion | N8AO darkens corners, gaps and contact points (loaded on demand). | `src/rendering/scene/Effects.tsx` |
| Quality | **High** (all of the above) or **Fast** (plain colours and simple light) in the 3D toolbar. Fast is chosen automatically when the browser reports a software renderer (SwiftShader, llvmpipe). | `editorStore.renderQuality` |

Finishes have an optional `texture` and `textureScale` (mm per repeat); files saved before this
load unchanged, and their texture is read from the finish name ("Oak planks" → planks, "White
quartz" → marble, walls → plaster).

### Photoreal render (AI)
**Photo** in the 3D toolbar (or "make a photoreal render" in chat, or Deliverables) captures the
current 3D view and sends it to `POST /api/render`, which asks Gemini's image model
(`gemini-nano-banana-2.1`, 2K JPEG) for a photograph of it: same camera, layout, counts, colours and
finishes, with real light, shadows and material detail. Options: daylight or evening light, and
decor notes. About 30 s. The image is labelled an **AI visualisation**: it can simplify or invent
small details (in testing it added shaker panels and drew a sink where the hob was), so sizes and
construction always come from the drawings and schedules. A browser path tracer
(three-gpu-pathtracer) was evaluated and not used: much slower per image, and less realistic than
the AI render for client presentations.

## 2. Design from a reference photo or video
The image button in the chat attaches up to 6 photos or one video. Photos are downscaled to JPEG in
the browser; a video is sampled into 6 evenly spaced frames (no upload service or storage). With the
designer's note, `POST /api/reference` asks Gemini (`gemini-3.8-flash`, structured JSON output) for:
style, a finish per surface (name, colour sampled from the image, texture type, sheen), kitchen
shape, room size with a confidence, and notable details. `referenceToResponse` (`src/ai/vision.ts`)
turns that into an ordinary proposal:
- by default: `create_finish` for each surface seen, then applied to all cabinets and each surface;
- "same layout": a layout goal for the planner (shape);
- "same room size": `set_room`, only when the estimate is medium or high confidence.

Everything is previewed and applied only after approval, like any other change. New finishes from
a reference (or from "paint the walls #c8d2c2" requests) use the domain command `define_material`;
editing a finish that is in use shows in the preview as a finish change.

## 3. The assistant acts in the space
A new reply kind, `act` (tool `interact`), does what a person does in the room without changing the
design (no approval, no undo step): open or close a unit, appliance or room door — a part by its
label ("the top drawer of the sink unit"; a door in front of an inner drawer opens first) or
everything; walk to stand at a unit or to a spot (x from the left wall, z from the back wall);
start or stop walking; look from a standard view or at an object; switch plan / 3D / split; go to a
saved viewpoint; change the visual style. It works typed, by voice (standard and realtime) and with
every provider, including the built-in rules ("open the fridge", "close everything", "walk to the
sink", "show the top view", "look at the hob", "go to viewpoint …").

## Sources
- three.js forum, "Achieving realistic ambience in architectural three.js scenes" (2026): AO,
  progressive shadows, WebGPU caveats, texture limits.
- gkjohnson/three-gpu-pathtracer (evaluated).
- Gemini API docs: image generation (models, editing, `response_format`), video understanding,
  structured output.
- Interior design tool surveys 2026 (Planner 5D, Homestyler, Coohom, Maket, photo-redesign tools):
  photo-to-design and AI renders are expected features; dimension estimation from photos has no
  published accuracy, hence the confidence gate.
