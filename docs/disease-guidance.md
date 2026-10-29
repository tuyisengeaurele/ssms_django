# Disease guidance on the result page

The card under a disease result ("What this may mean" and "What you can do now") is general guidance for a farmer.
The words live in `frontend/src/i18n/pages.ts` (keys starting `di`) and the layout in
`frontend/src/pages/farmer/DiseaseInfoCard.tsx`.

## What the check covers

The photo check was trained on two things only: grasserie and healthy silkworms. It cannot name any other disease, so
the card exists for grasserie alone. Notes on flacherie, muscardine and pebrine were written earlier and taken out when
the check was limited to what it was trained on. They are in the git history (before the "silkworm only" change) if a
model that can find them is built later.

## Status: needs review by a sericulture officer

Written on 27 October 2026 from public sources. Several of the sources could not be opened in full that day (see
below), so some lines rest on what search results said about them. **A sericulture officer should read the card in
English before it is relied on, and the French and Kinyarwanda need a native speaker.**

## Rules the wording follows

- No product name, dose, strength or number. Anything that depends on those goes to the supervisor or a sericulture
  officer. The test `DiseaseInfoCard.test.tsx` fails if a number or a named product appears.
- Say what is widely agreed and nothing more. Where the sources disagree or go quiet, say less.
- Always say it is general advice, not a diagnosis, and that the check can be wrong.

## Where each line comes from

| Line | What it says | Source and how sure we are |
|------|--------------|----------------------------|
| Grasserie: a virus disease, spread on leaves and equipment, worse in hot dry rooms and with poor leaves | cause and spread | Central Silk Board (India), district SILKS extension page on silkworm disease management. Seen through a search summary on 27 Oct 2026, the page itself returned an error when opened. |
| Grasserie: feed clean good leaves, clean and disinfect the room and equipment as the officer advises | prevention | Same page: disinfect the rearing house and appliances, remove and dispose of diseased larvae, avoid overcrowding. The page gives disinfectants and strengths. We left them out on purpose. |
| Steps for every disease: remove sick worms, dispose of them away from the room, wash hands and tools, check other trays, keep the room clean and aired, ask an officer before any disinfectant or medicine | general hygiene | Central Silk Board page (remove and dispose of diseased larvae, disinfect, keep temperature and humidity right). "Wash hands and tools" and "check other trays" are ordinary hygiene, not taken from one source. |

## Not covered

- Doses, products and how to disinfect. The Central Silk Board page names some. They differ by country and rearing
  setup, so they should come from the person advising the farm.
- Whether the card should say more for a result with low confidence.
- FAO's *Silkworm rearing* bulletins (Agricultural Services Bulletin 15/2 and 73/2) are the obvious further reading.
  We found the catalogue records, but not a copy to read.

## Changing it

Edit the `di*` keys in `pages.ts`. Keep a line out of the card unless a source in this table supports it, and add the
source here when you add a line.
