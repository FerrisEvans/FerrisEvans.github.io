# Cartoon dog author avatar

The author avatar is a newly generated cartoon illustration, not the user's
photograph. Generated with the built-in `image_gen` tool on 2026-11-04.
The dog photograph supplied by the user guides identity; the retained bear
avatar guides the established bold-outline illustration style. The 3D dog and
rabbit continue to use the original plush photographs as modeling references.

Selected original: `assets/brand/ferris-dog-avatar.png` (1254 × 1254 transparent PNG).
Its bytes are unchanged from the selected generated image; it is retained as an
authoring source outside the public directory, not downloaded by visitors.
The public avatar is `public/brand/island/ferris-dog-avatar.webp` (512 × 512),
derived without cropping or changing the illustration's composition.
The preceding textured draft was not selected. The retained bear avatar remains
at `public/brand/island/ferris-avatar.png` as a historical character/style source.

## Delivery derivative

`npm run assets:brand` reproducibly creates the WebP with Sharp: fit inside
512 × 512, no enlargement, quality 88, effort 6, with transparency retained.
The 88 px homepage avatar and 112 px about-page avatar use this same delivery
file through `SITE.avatar`; the original PNG is no longer published.

- Original: **1,460,585 bytes**, SHA-256 `27a9057a6b8d52cea21f804b91816962aa35e34ca3e344ed2e5f6b15f3702e79`.
- Delivery: **27,364 bytes**, SHA-256 `72129f3c4ce790534c3e4f38c876885ebe86ef07177cca9fc77d543216afc3c5`.
- Transfer reduction for this image: **98.13%**. WebP is a smaller display derivative, not a lossless replacement for the original.

`public/brand/island/identity.json` records both files, dimensions, encoding
settings and hashes. The generator verifies that neither the dog original nor
the retained bear illustration was altered.

## Final prompt

Create a new CARTOON AUTHOR AVATAR for the blog, using Image 1 ONLY for the dog's identity and Image 2 ONLY as the exact illustration STYLE reference. Image 1 is a photograph of a black plush dog; Image 2 is the existing rounded flat cartoon bear avatar. Draw the DOG as a character in the SAME graphic family as the bear: bold warm-brown clean outlines, large simple rounded flat shapes, very soft minimal shading, sparse details, warm storybook/vector-like 2D illustration. Absolutely no realistic plush fibers, photographic texture, fabric seams, toy photography, or 3D render. Preserve the black/charcoal dog's distinctive large round head, very long droopy ears, disproportionately large oval charcoal muzzle/nose, big brown-rimmed dark round eyes with cream catchlights, small slim upper body. Make both eyes visible in a nearly frontal friendly pose, with the large protruding muzzle still recognizable. The dog is the ONLY character; do not give it the bear's glasses, sprout or book. Head and shoulders portrait, both ears entirely in frame, cute calm curious expression. Keep a softly irregular pale mint circular background, with genuine transparency outside. Square composition suitable for a clear 80-pixel blog avatar. No text, no watermark, no hands, no room. This is a new illustration, not a photograph with a filter.
