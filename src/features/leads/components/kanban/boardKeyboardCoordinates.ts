import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

const LEFT = "ArrowLeft";
const RIGHT = "ArrowRight";
const STEP = 60;

/**
 * Arrow-key movement for a board of columns.
 *
 * `sortableKeyboardCoordinates` is the obvious import and the wrong one here:
 * it derives the next position from a `SortableContext`, which a kanban of
 * independent droppable columns does not have. With it the card is grabbed and
 * then cannot be moved at all — the sensor works, the traversal does not.
 *
 * dnd-kit's default getter nudges by 25px, so crossing a 288px column takes a
 * dozen presses. This one snaps: left and right jump to the centre of the
 * neighbouring column, so one press is one stage. Up and down keep a small
 * nudge, for scrolling a tall column into reach.
 */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context },
) => {
  if (event.key !== LEFT && event.key !== RIGHT) {
    if (event.key === "ArrowUp") {
      return { ...currentCoordinates, y: currentCoordinates.y - STEP };
    }
    if (event.key === "ArrowDown") {
      return { ...currentCoordinates, y: currentCoordinates.y + STEP };
    }
    return undefined;
  }

  event.preventDefault();

  // Columns in visual order, left to right.
  const columns = [...context.droppableContainers.values()]
    .map((c) => ({ id: c.id, rect: c.rect.current }))
    .filter((c): c is { id: typeof c.id; rect: NonNullable<typeof c.rect> } => c.rect !== null)
    .sort((a, b) => a.rect.left - b.rect.left);

  if (columns.length === 0) return undefined;

  // Where the card is now — the column whose band contains the pointer, or the
  // nearest one when the drag started between two of them.
  let index = columns.findIndex(
    (c) => currentCoordinates.x >= c.rect.left && currentCoordinates.x <= c.rect.left + c.rect.width,
  );
  if (index === -1) {
    index = columns.reduce((best, c, i) => {
      const centre = c.rect.left + c.rect.width / 2;
      const bestColumn = columns[best];
      if (!bestColumn) return i;
      const bestCentre = bestColumn.rect.left + bestColumn.rect.width / 2;
      return Math.abs(currentCoordinates.x - centre) < Math.abs(currentCoordinates.x - bestCentre)
        ? i
        : best;
    }, 0);
  }

  const nextIndex = event.key === RIGHT ? index + 1 : index - 1;
  const target = columns[nextIndex];
  // At either end, stay put rather than wrapping around: wrapping would send a
  // card from "Perdido" to "Novo" on a keystroke meant to do nothing.
  if (!target) return undefined;

  return {
    x: target.rect.left + target.rect.width / 2,
    y: target.rect.top + Math.min(target.rect.height / 2, 200),
  };
};
