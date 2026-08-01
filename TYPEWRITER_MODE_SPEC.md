## Typewriter autoscroll spec

The arrow is a fixed-position marker outside the textarea, on the left,
pointing at the autoscroll line: 25% down from the top of the viewport.
Reuse the existing hide/show fade (same cadence as the innerly logo).

The editor has two modes. Programmatic scrolls must be tagged/ignored so
they are never mistaken for user scrolls.

TYPEWRITER mode (default):
- As the user types and the caret would pass below the arrow line,
  autoscroll so the caret line stays at the arrow (typewriter feel).
- Only autoscroll when typing pushes the caret past the arrow from above;
  never while editing above it.

FREE mode:
- If the user manually scrolls so the bottom of the text/caret sits below
  the arrow, disable autoscroll entirely — they can type/edit freely there.

Transitions:
- If the user has scrolled so the text bottom is above the arrow, then
  starts typing at the end of the content, gracefully snap (animate, don't
  jump) so the caret returns to the arrow line, and re-enter TYPEWRITER mode.
- Clicking the arrow gracefully snaps so the caret sits at the arrow line on
  the last line of content, and re-enters TYPEWRITER mode.

Keep it simple: prefer padding-bottom for scroll room over injected newlines.