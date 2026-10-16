# Design

## Source of truth
Status: Active. Refreshed: 2026-10-16. Surface: one-page paper invitation. Evidence: supplied public/front.webp and public/back.webp (1087 × 1600), agreed interactions. No pre-existing design system.

## Brand
Quiet, personal, tactile. White paper, ivory botanical wax, warm neutral surroundings. Preserve the actual invitation. Avoid neon, dashboards, glass effects and UI clutter.

## Product goals
Seal, open, pull, turn, examine, simulate photographing QR. Success is an understandable complete flow on touch and desktop. Comprehensive invitation functions, real camera, audio and backend are excluded.

## Personas and jobs
Wedding guests, including people unfamiliar with gestures, open a shared link and read the card before visiting its existing mobile website.

## Information architecture
One scene; no menu. Hierarchy: scene, persistent current-action guidance, subtle replay/context controls. Camera is a temporary layer over the back.

## Design principles
Preserve artwork; make the ritual interactive; continuously guide the current action. Direct manipulation and short tactile transitions. Release after a gentle 24–40px upward pull completes extraction; incidental motion springs back. Keep artwork readable and controls reachable.

## Visual language
Warm-white #f5f2ed surroundings, ivory paper, blue #91bfd0 accents, dark #384a50 text. Serif headings, readable system Korean text. Generous space, restrained tracked labels, fine rules, soft shadows, subtle vellum overlaps, cotton ties, botanical wax seal. Original card images remain uncropped.

Final user references: translucent ivory wrap with a vertical overlap, two fine cotton ties and a restrained botanical wax seal. The seal is about 23–25% of the envelope width, attached at the tie crossing. Avoid exaggerated depth. First entry says “청첩장이 도착했습니다!”. Explicit flip remains available at every zoom level and preserves scale/pan; enlarged drags/taps never flip.

## Components
Envelope (closed/open), seal, two-sided card (normal/enlarged), persistent animated guide, reader controls, draggable unfolded Fold8-style phone (unaligned/aligned/capture), replay. Scene owns state; small pure helpers own geometry.

## Accessibility
Visible keyboard focus, named buttons, readable contrast, 44px targets. Extract/flip/zoom/aim alternatives. Guide changes announced as status. Camera supports escape and restores focus. Reduced motion preserves instructions and steps.

## Responsive behavior
Fit original card ratio within available viewport height and safe areas. Small landscape screens may scroll vertically rather than clip controls. Touch: pinch/drag. Desktop: wheel/mouse drag. Resize preserves scene state.

## Interaction states
Loading: reserve artwork ratio. Asset error: readable reload guidance. Closed: seal guide. Open: pull guide. Extracted: flip/zoom guide. Camera: aim/shutter guidance. Success: brief capture then final URL. Misaligned shutter stays and guides. Replay resets all. Slow/offline: static assets, no backend.

## Content voice
Warm concise Korean honorifics: 인장을 눌러 열어 주세요; 카드를 위로 꺼내 주세요; QR에 맞춰 촬영해 주세요. Keep implementation details outside guest UI.

## Implementation constraints
Vanilla JavaScript/CSS, Vite static build, Pages project base path. No camera permission or QR decoder. Cap transforms, prevent drag-to-flip, keep guides from intercepting gestures. Test state/gesture boundaries, Chromium/WebKit layout and screenshots.

## Open questions
None blocking. Exact spacing, timing, thresholds and rendering are delegated.

## Image assets
The closed envelope uses public/vellum-envelope.png, derived with built-in imagegen from the user-supplied vellum photograph. Prompt: isolate the frontmost envelope, straighten perspective, preserve ivory paper, vertical overlap, white cotton ties and pale botanical seal, transparent background, restrained depth, no writing or surrounding objects. Open envelope layers remain interactive CSS. Original front/back artwork is unchanged.

Camera reference: https://www.samsung.com/us/smartphones/galaxy-z-fold8/ (2026-10-16). Broad unfolded silhouette, thin graphite frame, quiet center crease; an illustrative camera interaction, not a hardware simulator.
