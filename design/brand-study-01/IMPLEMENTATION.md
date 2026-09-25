# Landing page implementation

The landing page now uses a paper, charcoal, orange, pale blue and pale yellow palette. The public page is available without Supabase configuration; account buttons lead to the configuration notice when credentials are absent. With configuration, they use the existing authentication flow.

The full SVG icon folder was copied from KingFTP's apps/web/public/icons. A reusable local mask component replaces lucide-react imports throughout BottleUp. The local Google Sans Flex font was copied from that project's public/fonts folder. Brand.jsx supplies a consistent bottle/arrow mark, also used for the favicon.

The landing page uses the approved pickup scene, plus an additional generated still life for the rewards calculator. Production images are compressed WebP files. Original art is retained in this design folder. The brand-board and UI concept images remain references rather than screenshots embedded into the website.

## Validation

- Production build passes; the existing lazy Mapbox bundle still produces Vite's large-chunk advisory.
- Browser inspected at desktop, 820 px, 390 px, and 320 px widths.
- Verified calculator changes from 5 kg / 500 points to 12 kg / 1,200 points.
- Verified mobile menu opens and its links close the menu and navigate to sections.
- Verified FAQ answers expand, privacy and terms open, and back navigation returns to the page.
- Verified pickup entry reaches the configuration notice in this environment, which has no Supabase credentials. Live sign-in and database operations were not tested.
- Images load successfully; 320 px viewport has no document-level horizontal overflow.
- Source icon references checked against the copied SVG folder.

Additional illustration was generated with the built-in image tool using this prompt:

> Create a standalone editorial product illustration for BottleUp recycling rewards website. Square composition, background a perfectly flat warm pale butter yellow #F3EBCF with no text. Three empty used PET plastic bottles, one tall transparent sky-blue water bottle with blue cap upright, one shorter transparent orange-cap bottle tilted gently, one green bottle standing slightly behind. Beside them one small rounded orange token with a simple embossed four-point sparkle, no currency signs. Sophisticated cut-paper and hand-painted screenprint illustration, tactile subtle grain INSIDE objects, bold solid silhouettes and believable bottle ridges, sunny sharp cast shadows falling lower right, beautifully composed still life viewed at slight elevated eye level. Objects occupy central 75% with generous clean background. Contemporary warm local consumer brand aesthetic, palette warm yellow, pale blue, tangerine orange, dark forest used sparingly. No humans, no leaves, no words, no logos, no gradients in background, no UI, no frame. This illustration accompanies a service that awards points only after plastic weight is verified.
