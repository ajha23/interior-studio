# Whole homes: apartments and villas

Design a complete 1–6 BHK apartment or a two-floor villa, then refine any room with every room-level
feature (units, furniture, finishes, walk-through, interact, drawings, renders, the assistant).

## Getting one
- Projects page → **New home**: type (apartment / villa), bedrooms, optional carpet area and style,
  or describe it ("3BHK apartment, 1400 sq ft, japandi") and the fields fill in.
- Or ask the assistant anywhere: "design a 3BHK apartment", "a four bedroom villa of 2,400 sq ft in
  warm wood" (tool `design_home`, reply kind `home`; works typed, by voice and with the built-in rules).

## Model (`src/domain/home/schema.ts`)
A `Home` is rooms on a floor plan. Each `HomeRoom` has a name, a use (`RoomType`: living, dining,
kitchen, master-bedroom, bedroom, bathroom, study, pooja, utility, balcony, foyer, family, staircase,
store), a level, its position (`x`, `z`: back-left inner corner, mm on the plot) and a **complete room
design in the existing project format** (walls, doors, windows, units, furniture, finishes). So the
room editor, deliverables and assistant work on a room unchanged. Homes are stored in their own
IndexedDB store (`homes`, DB version 2) and as `interior-studio/home` files.

## Generator (`src/engine/home/generate.ts`)
Research (Oct 2026): procedural floor-plan methods (ProcTHOR recursive subdivision, constrained
growth, squarified treemaps, Infinigen's split-and-match) and typical Indian room sizes (2BHK living
≈12×15 ft, 3BHK ≈14×17 ft, kitchens 8×10–10×12 ft, bedrooms 10×12–13×15 ft, baths 5×7–5×8 ft,
utility 5×6, pooja 4×4–5×5).

1. **Programme** from the BHK count: master bedroom with bath, bedrooms (an attached bath for
   bedroom 2 from 3BHK), a common bath, living, dining, kitchen, utility (2BHK+), pooja (3BHK+),
   balcony. Villas: ground floor (guest bedroom and bath, pooja, living, dining, kitchen, utility,
   staircase) and first floor (master suite, bedrooms with baths, family lounge, study, balcony,
   staircase above the one below).
2. **Zoned plan**: a private band (bedrooms, baths) at the back, a 1.2 m corridor, a public band
   (living, dining, kitchen…) at the front. Living spaces and bedrooms widen (at most 1.35×) so both
   bands share one footprint; a short band gets a study or store. Rooms are separated by two
   115 mm partitions. A carpet area scales every room (0.75×–1.4×).
3. **Openings**: doors near a corner on the corridor side, wide archways for living and dining,
   the kitchen opening to the dining room, the main entrance on the living room's outside wall.
4. **Furniture by use**, through the domain's own commands (`add_furniture` with a wall placement
   or a position, `add_cabinet`, `add_appliance`), so collisions, door swings, window blocking and
   size limits are checked like any edit; anything that does not fit is left out and listed.
   Bedrooms: bed against the end wall with bedside tables, wardrobe opposite, desk in bedrooms.
   Baths: shower in the far corner, WC and basin clear of the door. Living/family: sofa, TV unit,
   coffee table (armchair when wide). Dining: 4 or 6 seats. Kitchen: a straight run with wall units
   and hood, fitted to the wall. Study, pooja unit, utility sink, balcony chairs, staircase.
5. **Windows** last, in wall spans still free (centre first, then either side); small and high in
   baths; a second window on the end wall for corner living spaces.
6. **Style** (modern neutral, warm wood, japandi, industrial): shared finishes (`style-floor`,
   `style-wall`, `style-wood`, `style-kitchen`, `style-soft`, `style-counter`, bath tiles) used by
   every room, so **Style for every room** (`restyleHome`) changes the whole home at once.

Every generated room passes the domain validation with no issues (tested for 1–4 BHK and a 4BHK
villa).

## New furniture and fixtures
Bed, wardrobe (doors open), bedside table and dresser (drawers open), desk, TV unit (doors open),
coffee table, bookshelf, armchair, WC, wash basin (vanity doors open), shower, bathtub and staircase,
each with real-size specs and 3D models, in the library, the command line ("add bed 1800") and the
assistant ("add a wardrobe", "open the wardrobe", "move the bed to the left wall").

## Views (`src/features/home`)
- **Plan**: walls at real thickness, door/archway gaps, windows, every footprint, room names, sizes
  and areas; level tabs for villas; units ft-in, m or mm.
- **3D dollhouse**: all rooms of the level (and those below) with their finishes; walls facing the
  camera are cut away.
- **Room list and inspector**: name, use, width and length (validated by the domain), area, and
  **Design this room**, which opens the full room editor; **← Home plan** returns with the edits
  (unsaved until **Save**).

## Limits
- Rectangular rooms on a rectangular, zoned footprint; no L-shaped rooms or irregular plots yet.
  Resizing a room on the home plan does not move its neighbours (gaps or overlaps are the
  designer's to adjust).
- Doors between neighbouring rooms are drawn in each room; a door in one room's wall is not
  mirrored in the neighbour's wall automatically.
- Walking through the whole home happens room by room (walk mode inside each room).
