# Reading garden asset sources

The current **未尽** homepage scene is an open woodland reading garden assembled
from five verified, free CC0 asset packs. The charcoal dog is the central host,
with the original Ferris bear and cream rabbit as companions. The bear retains its spectacles, sprout and stool,
with a fuller continuous head/body silhouette and an open green reading book.
The dog smells a raised flower pot, the bear reads beside the picnic, and the
rabbit tends a small raised flowerbed with the sourced watering can. Dog and rabbit are original
reference-led plush models, with packed fabric textures and separate joints.
User-provided photographs guided their original modeling. Those photographs
are no longer retained in the repository and are not build inputs or embedded
runtime textures; the checked-in Python geometry reconstructs both characters.

Original supporting details include the timber deck, bookcase frame/back braces
and dowels, open journal with a hinged page, pencil, coaster, small planted-soil
pockets and connected light cable/pendants. The large environmental,
furniture, plant, bird and picnic models come from the packages below. Their
original mesh shapes, UVs and atlas colors are retained; transforms and a matte
material response adapt them to the composition. Plant foliage and pots are
separated along existing connected islands for leaf-only motion, preserving
all source faces and UVs. Trailing plants use the pot foot as their support
point and sit at a shelf/table edge so their leaves can hang naturally.

The existing `public/assets/brand/ferris-avatar.png` is a repository visual
reference. This project makes no new claim about its upstream authorship.

## Adopted packages

The table records models actually present in the exported GLB. The delivered
GLB's node `extras.vendorAssets` and
`public/island/model-report.json` agree on the source set. All five included
licenses were read; they identify the named author and CC0 and permit personal,
educational and commercial use. Attribution is optional and retained here.
No paid Extra/Source tier, paid Blender file or purchase was used.

| Package / official source | Author | Exported source models | Scene use | Versioned evidence |
| --- | --- | ---: | --- | --- |
| [Tiny Treats - Pretty Park 1.0](https://tinytreats.itch.io/pretty-park) | Isa Lousberg / Tiny Treats | 21 | Modular grass ground, fountain, benches, lanterns, birds, hedges, cobbles, flowers and one tree. | [SOURCE.json](../../public/assets/island/vendor/tinytreats-pretty-park-1.0/SOURCE.json), [LICENSE.txt](../../public/assets/island/vendor/tinytreats-pretty-park-1.0/LICENSE.txt) |
| [Tiny Treats - Pleasant Picnic 1.0](https://tinytreats.itch.io/pleasant-picnic) | Isa Lousberg / Tiny Treats | 12 | Picnic blanket, cushions, basket, tea service, food and the radio. | [SOURCE.json](../../public/assets/island/vendor/tinytreats-pleasant-picnic-1.0-full/SOURCE.json), [LICENSE.txt](../../public/assets/island/vendor/tinytreats-pleasant-picnic-1.0-full/LICENSE.txt) |
| [Tiny Treats - House Plants 1.0 FREE](https://tinytreats.itch.io/house-plants) | Isa Lousberg / Tiny Treats | 9 | Complete potted plants, pots, watering can and shovel around the potting table, desk and bookcase. | [SOURCE.json](../../public/assets/island/vendor/tinytreats-house-plants-1.0/SOURCE.json), [LICENSE.txt](../../public/assets/island/vendor/tinytreats-house-plants-1.0/LICENSE.txt) |
| [KayKit Furniture Bits 1.0](https://kaylousberg.itch.io/furniture-bits) | Kay Lousberg / KayKit | 8 | Bookcase shelves and books, writing desk, chair, table lamp, potting table and radio stool. | [SOURCE.json](../../public/assets/island/vendor/kaykit-furniture-bits-1.0/SOURCE.json), [LICENSE.txt](../../public/assets/island/vendor/kaykit-furniture-bits-1.0/LICENSE.txt) |
| [KayKit Forest Nature Pack 1.0 FREE](https://kaylousberg.itch.io/kaykit-forest) | Kay Lousberg / KayKit | 8 | Four canopy trees, rocks and grass clusters framing the clearing. | [SOURCE.json](../../public/assets/island/vendor/kaykit-forest-nature-1.0/SOURCE.json), [LICENSE.txt](../../public/assets/island/vendor/kaykit-forest-nature-1.0/LICENSE.txt) |

Each `SOURCE.json` retains the official download route, author, free tier,
archive SHA-256, exact revision where supplied, original paths and per-file
`bytes`/SHA-256. Every adopted `.gltf`, external `.bin` and referenced PNG is
available offline in that package directory. Relative URIs resolve without a
network request. The repository retains the 58 adopted models, their original
BIN/PNG dependencies and all five package licenses. Unused candidate models and
their exclusive dependencies were removed before release, including the initial
four-model Picnic directory superseded by the current Picnic subset.
No retained model, buffer, image or license bytes were changed. Original archive
URLs, revisions, archive hashes and per-file source paths remain in `SOURCE.json`.

## Actual exported source models

Names below are exact source filenames. Counts describe each source model, not
the combined scene after instancing and batching. All external models are
static and contain no animation clips. The original bear provides the scene's
`Idle`, `Attention` and `Wave` clips. `Idle` is a six-second reading cycle with
coordinated head, hands, held book, hinged page and blinking. Both `Idle` and
`Wave` explicitly animate `Bear_Book` and `Bear_Book_Page`, so a greeting can
blend back into reading without leaving the page halfway through a turn.

### Tiny Treats - Pretty Park 1.0

Source directory: `public/assets/island/vendor/tinytreats-pretty-park-1.0/`.

| Source model | Source triangles | Materials |
| --- | ---: | ---: |
| `bench.gltf` | 396 | 1 |
| `bird.gltf` | 652 | 1 |
| `bush_large.gltf` | 312 | 1 |
| `cobble_stones.gltf` | 448 | 1 |
| `floor_grass_sliced_A.gltf` | 90 | 1 |
| `floor_grass_sliced_B.gltf` | 24 | 1 |
| `floor_grass_sliced_C.gltf` | 90 | 1 |
| `floor_grass_sliced_D.gltf` | 24 | 1 |
| `floor_grass_sliced_E.gltf` | 12 | 1 |
| `floor_grass_sliced_F.gltf` | 24 | 1 |
| `floor_grass_sliced_G.gltf` | 90 | 1 |
| `floor_grass_sliced_H.gltf` | 24 | 1 |
| `floor_grass_sliced_I.gltf` | 90 | 1 |
| `flower_A.gltf` | 192 | 1 |
| `flower_B.gltf` | 166 | 1 |
| `fountain.gltf` | 1646 | 1 |
| `grass_B.gltf` | 208 | 1 |
| `hedge_straight.gltf` | 232 | 1 |
| `hedge_straight_long.gltf` | 372 | 1 |
| `street_lantern.gltf` | 424 | 1 |
| `tree.gltf` | 320 | 1 |

### Tiny Treats - Pleasant Picnic 1.0

Source directory: `public/assets/island/vendor/tinytreats-pleasant-picnic-1.0-full/`.

| Source model | Source triangles | Materials |
| --- | ---: | ---: |
| `grapes_bowl.gltf` | 688 | 1 |
| `mug.gltf` | 300 | 1 |
| `picnic_basket_square.gltf` | 1062 | 1 |
| `picnic_blanket_green.gltf` | 456 | 2 |
| `pillow_large_green.gltf` | 240 | 1 |
| `pillow_small_blue.gltf` | 240 | 1 |
| `plate_A.gltf` | 224 | 1 |
| `radio.gltf` | 830 | 1 |
| `sandwich.gltf` | 676 | 1 |
| `serving_tray_round.gltf` | 192 | 1 |
| `spoon.gltf` | 324 | 1 |
| `teapot.gltf` | 698 | 1 |

### Tiny Treats - House Plants 1.0 FREE

Source directory: `public/assets/island/vendor/tinytreats-house-plants-1.0/`.

| Source model | Source triangles | Materials |
| --- | ---: | ---: |
| `cacti_plant_pot_small.gltf` | 792 | 1 |
| `monstera_plant_medium_potted.gltf` | 3108 | 1 |
| `pothos_plant_small_potted.gltf` | 1792 | 1 |
| `pots_stacked.gltf` | 588 | 1 |
| `pot_A_medium.gltf` | 216 | 1 |
| `sansevieria_plant_medium_potted.gltf` | 936 | 1 |
| `shovel.gltf` | 296 | 1 |
| `succulent_plant_pot_small.gltf` | 3386 | 1 |
| `watering_can_A.gltf` | 630 | 1 |

### KayKit Furniture Bits 1.0

Source directory: `public/assets/island/vendor/kaykit-furniture-bits-1.0/`.

| Source model | Source triangles | Materials |
| --- | ---: | ---: |
| `shelf_B_large.gltf` | 212 | 1 |
| `table_medium_long.gltf` | 168 | 1 |
| `table_low.gltf` | 276 | 1 |
| `chair_B_wood.gltf` | 384 | 1 |
| `chair_stool_wood.gltf` | 216 | 1 |
| `lamp_table.gltf` | 392 | 1 |
| `book_set.gltf` | 196 | 1 |
| `book_single.gltf` | 68 | 1 |

### KayKit Forest Nature Pack 1.0 FREE

Source directory: `public/assets/island/vendor/kaykit-forest-nature-1.0/`.

| Source model | Source triangles | Materials |
| --- | ---: | ---: |
| `Tree_1_B_Color1.gltf` | 636 | 1 |
| `Tree_1_C_Color1.gltf` | 1364 | 1 |
| `Tree_3_A_Color1.gltf` | 978 | 1 |
| `Tree_4_A_Color1.gltf` | 404 | 1 |
| `Rock_2_C_Color1.gltf` | 108 | 1 |
| `Rock_3_A_Color1.gltf` | 84 | 1 |
| `Grass_1_A_Color1.gltf` | 44 | 1 |
| `Grass_2_A_Color1.gltf` | 44 | 1 |

## Texture and provenance integrity

`vendor.py` verifies every versioned source file against its recorded length
and SHA-256 before import. It shares images by content hash rather than filename:
Pretty Park's `tiny_treats_texture_1.png` is different from the same-named
Picnic/House Plants atlas. Material sharing includes the texture hash, base
color, alpha, metallic value and face-culling state. Source geometry and UVs are
unchanged; scene roughness is set to 0.92 and specular IOR level to 0.22.

The exported GLB contains six embedded source PNG images: the Pretty Park palette,
Pretty Park grass pattern, shared Picnic/House Plants palette, green plaid
pattern, KayKit Furniture Bits atlas and KayKit Forest atlas. Their embedded
bytes match the source PNG hashes. Four additional original generated fabric
images supply the dog/rabbit normal maps and rabbit floral cloth, making ten
embedded images in total. Shared images can have multiple glTF texture/sampler
entries; the current material contract includes 15 texture entries. No external
texture URL is needed at runtime.
The `.blend` uses packed images. Static batching preserves a sorted
`vendorAssets` source list on each merged mesh; it does not merge objects across
interaction or animation parents.

The source model list is also exposed in `model-report.json.externalAssets`;
`assetInstances` records each placement, scale, rotation and parent group.
The report records the delivered file's actual geometry/material/texture counts
and clip channels. See that report for current build metrics rather than
copying potentially stale metrics into this document.

## Reproduction

From the repository root with Blender 5.2 or a compatible version installed:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/island/build_scene.py
```

The standalone process reads `geometry.py`, `character.py`, `friends.py`, `vendor.py` and
`export_scene.py`, then writes `public/assets/island/island.blend`,
`public/island/island.glb` and `public/island/model-report.json`. It does not
access an interactive Blender document or download assets. Add `-- --render`
to create `/tmp/weijin-rebuild/garden-preview.png` for modeling review. This
artist preview is not a browser screenshot or production cover.

The editable `.blend` retains the camera, lights, character pivots, packed
textures and NLA tracks. Enable `Idle`, `Attention` or `Wave` to inspect a clip;
tracks are muted in the saved rest view. Blender uses Z up / -Y front, while
glTF and Three.js use Y up / +Z front. Semantic groups remain `Library`,
`Noticeboard`, `Categories`, `Dog`, `Tags`, `Mailbox` and `Environment`; their
current visible objects are the bookcase, writing desk, fountain, dog, potting
corner, radio and surrounding garden. `Bear` and `Rabbit` remain separate
companion roots. `model-report.json.interactionPivots` records exported book,
page, lamp, foliage, radio and fountain anchors in Three coordinates. Pots stay
fixed while `Plants_*_Foliage` children sway; `Desk_Page` hinges at the journal
spine; both fountain water surfaces have explicit anchors. The rabbit's can
is parented to its hand grip; its measured nozzle centre and unit `flow_axis`
are exported as metadata. A local Z pour angle of -0.95 rad turns the true
nozzle direction downward, while the soil target remains fixed under
`Environment`. Content titles and links stay in HTML.

The homepage itself hosts this scene. A separate exploration page or a normal
article grid is not part of this garden asset's intended entry flow. Browser
capture, fallbacks, interaction and mobile checks are documented in
[ASSET_PIPELINE.md](ASSET_PIPELINE.md).
