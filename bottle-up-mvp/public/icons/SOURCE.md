# Icon source

BottleUp uses a subset of the SVG icon library copied from the owner's KingFTP project on 25 September 2026. The app renders these local assets as CSS masks through `src/components/Icons.jsx`.

Only icons referenced by the application are retained. References include named exports in `Icons.jsx`, direct `Icon` usage, and conditional names in the landing/authentication screens. When introducing an icon, add its SVG here and check both branches of any conditional name. Preserve the original asset attribution and applicable licensing when adding files.
