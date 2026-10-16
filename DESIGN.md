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
Envelope (closed/open), seal, two-sided card (normal/enlarged), persistent animated guide, reader controls, draggable Galaxy phone using the supplied body photograph (unaligned/aligned/capture), replay. Scene owns state; small pure helpers own geometry.

## Accessibility
Visible keyboard focus, named buttons, readable contrast, 44px targets. Extract/flip/zoom/aim alternatives. Guide changes announced as status. Camera supports escape and restores focus. Reduced motion preserves instructions and steps.

## Responsive behavior
Fit original card ratio within available viewport height and safe areas. Small landscape screens may scroll vertically rather than clip controls. Touch: pinch/drag. Desktop: wheel/mouse drag. Resize preserves scene state.

## Interaction states
Loading: reserve artwork ratio. Asset error: readable reload guidance. Closed: seal guide. Open: pull guide. Extracted: flip/zoom guide. Camera: aim/shutter guidance. Success: brief capture then final URL. Misaligned shutter stays and guides. Replay resets all. Slow/offline: static assets, no backend.

QR discovery: only while reading the back, the QR button makes one tiny sideways nudge every 8 seconds, resting for most of the cycle. Two small pale-blue sparkles fade separately in the whitespace outside the QR, without covering its modules or intercepting gestures. Suppress both cues in camera mode, on the front, and for reduced motion; keep the QR still while enlarged. Hover/focus stops the button motion for easy activation. No extra text, bright halo or continuous shaking.

## Content voice
Warm concise Korean honorifics: 인장을 눌러 열어 주세요; 카드를 위로 꺼내 주세요; QR에 맞춰 촬영해 주세요. Keep implementation details outside guest UI.

## Implementation constraints
Vanilla JavaScript/CSS, Vite static build, Pages project base path. No camera permission or QR decoder. Cap transforms, prevent drag-to-flip, keep guides from intercepting gestures. Test state/gesture boundaries, Chromium/WebKit layout and screenshots.

## Open questions
None blocking. Exact spacing, timing, thresholds and rendering are delegated.

## Image assets
The closed envelope uses public/vellum-envelope.png, derived with built-in imagegen from the user-supplied vellum photograph. Prompt: isolate the frontmost envelope, straighten perspective, preserve ivory paper, vertical overlap, white cotton ties and pale botanical seal, transparent background, restrained depth, no writing or surrounding objects. Open envelope layers remain interactive CSS. Original front/back artwork is unchanged.

Camera: illustrative interaction, not a hardware simulator. Latest supplied photographs below govern its visible appearance.

Latest camera reference supersedes the wide foldable drawing: use supplied phone-body.png intact as the outer frame, cover its wallpaper with a live simulated invitation preview. Recreate the supplied QR scanner overlay with white corner brackets, QR search text, light/gallery controls and Android navigation details. Light toggles preview brightness; gallery opens the seven supplied bear photographs in a phone-contained album and full-image viewer; centered shutter captures after manual aiming. No red screenshot background or wallpaper appears in the camera screen.

Gallery: black Galaxy-style photo grid, seven supplied PNGs preserved intact including watermarks. Tap a thumbnail for a contained, uncropped image, previous/next controls and photo count. Back traverses photo → album → scanner; home returns to scanner; close returns to invitation. Gallery actions never move the phone or trigger capture. Replay resets the album.

Recipient sharing: `?to=민수` renders “민수 님께” in the lower-right footer, without altering original invitation artwork. No name means no recipient label. Sticky-header 공유하기 opens a native modal asking “누구에게 전하실 건가요?” with the current recipient prefilled, editable and optional. Sharing uses the entered name in both the encoded `to` URL and text (“민수 님께, 원식과 경민의 청첩장을 전합니다.”); an empty name uses the existing default invitation description. Preview the outgoing text. Use native Web Share where available; otherwise copy text plus URL. A separate link-copy button copies only the URL. Cancellation stays cancelled; clipboard denial leaves a selectable URL and honest guidance. Use textContent, normalize whitespace, cap names at 40 Unicode code points, and replace stale query/hash data in newly shared links. Static OG metadata remains common to all links.
