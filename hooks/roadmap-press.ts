import type { ElementTable, On, UiPressArgument } from "claude-code";

// The desktop drops a pane's first click: while the pane's focus ring sits elsewhere (on
// nothing after open, or lost after a click in the chat), a click on a Button only moves the
// ring there (ui.focus, origin person) and raises no ui.press. autoFocus and opening with
// focus don't help. So the pane draws its Buttons through `tracked`, which keeps each one's
// onPress by key; a person's ring move onto one on the desktop runs it, and a ui.press the
// same click may still raise is swallowed. The cost: on the desktop, Tab onto a Button
// presses it.

const PANE = "kit-roadmap"; // roadmap-view.tsx's pane
const SAME_CLICK_MS = 250;
const presses = new Map<string, (e: UiPressArgument) => void>();
let surface = "";
let ran: { key: string; at: number } | null = null;

// The element table with a Button that remembers its onPress (key defaults to the label,
// as the engine's does). Called on every draw: the last drawing's buttons are the live ones.
export function tracked(el: ElementTable, drawnOn: string): ElementTable {
  surface = drawnOn;
  presses.clear();
  const Button: typeof el.Button = (props) => {
    const key = props.key ?? props.label;
    if (key) presses.set(key, props.onPress);
    return el.Button(props);
  };
  return { ...el, Button };
}

export function pressOnFocus(on: On) {
  on("ui.focus", { requestId: PANE }, async (_$, e, next) => {
    const done = await next(e);
    const key = e.element;
    const press = key ? presses.get(key) : undefined;
    if (done.deny || !key || !press || surface !== "desktop") return done;
    if (e.origin.kind !== "person") return done;
    ran = { key, at: Date.now() };
    press({
      plugin: e.plugin ?? "",
      element: key,
      component: e.component,
      requestId: e.requestId,
      surface: "desktop",
    });
    return done;
  });

  on("ui.press", { requestId: PANE }, async (_$, e, next) => {
    if (ran?.key !== e.element || Date.now() - ran.at > SAME_CLICK_MS)
      return next(e);
    ran = null; // the click the ring move already ran
    return { element: e.element };
  });
}
