
# TrippDrip — Free Foundation Patch

This patch keeps everything **free** and sets up the app to be plug‑and‑play with providers later:
- Real UI send in conversation drawers (writes to localStorage).
- Simulate inbound messages to test flows.
- Settings page stores placeholder API keys locally.
- Full Import/Export JSON of your local data.

## Apply
1. Unzip this patch.
2. Copy it into your existing `trippdrip-v8-sprint1/` project (merge & replace files).
3. Restart the dev server: `npm run dev`

## Files
- lib/storeOps.ts (new): helpers to send/simulate messages.
- components/ConversationDrawer.tsx (updated): sends messages via props.
- app/texts/page.tsx (updated): wires send → local store.
- app/email/page.tsx (updated): wires send → local store.
- app/settings/page.tsx (updated): placeholder keys + import/export + simulate inbound.
