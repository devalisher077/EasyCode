import { useEffect, useRef, type RefObject } from "react";

/** Keep keyboard focus inside the open dialog and return it when closed. */
export function useDialog(
  open: boolean,
  onClose: () => void,
  dialogRef?: RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog =
      dialogRef?.current ||
      document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          "button, input, select, textarea, a[href], summary, [tabindex]",
        ),
      ]
        .filter((element) => {
          if (
            element.matches(":disabled") ||
            (element.hasAttribute("tabindex") && element.tabIndex < 0)
          )
            return false;
          // Content inside collapsed <details> is not in the browser's tab order;
          // its own summary remains keyboard-accessible.
          const collapsed = element.closest("details:not([open])");
          if (collapsed && element !== collapsed.querySelector("summary"))
            return false;
          for (
            let node: HTMLElement | null = element;
            node;
            node = node.parentElement
          ) {
            const style = getComputedStyle(node);
            if (
              node.hidden ||
              node.hasAttribute("inert") ||
              node.getAttribute("aria-hidden") === "true" ||
              style.display === "none" ||
              style.visibility === "hidden"
            )
              return false;
            if (node === dialog) break;
          }
          return true;
        })
        .sort((left, right) => {
          // Match native tab order, including any explicitly positive tabindex.
          const leftOrder = left.tabIndex > 0 ? left.tabIndex : Infinity;
          const rightOrder = right.tabIndex > 0 ? right.tabIndex : Infinity;
          if (leftOrder !== rightOrder) return leftOrder - rightOrder;
          return left.compareDocumentPosition(right) &
            Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1;
        });
    const initialElements = focusable();
    const input = initialElements.find((element) =>
      element.matches("[autofocus], input, textarea"),
    );
    (input || initialElements[0])?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      if (!dialog!.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, dialogRef]);
}
