import { useEffect, useRef } from "react";

type UseLobbyKeyboardNavigationArgs = {
  actionKey: string;
  capturingControlKey: unknown;
  closeTopLobbyModal: () => boolean;
  isControlsSettingsOpen: boolean;
  keyboardEnabled: boolean;
};

const LOBBY_NAV_LAYERS = [
  "daily",
  "mode",
  "mini",
  "primary",
  "bottom",
  "lang",
] as const;

const ARROW_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export function useLobbyKeyboardNavigation({
  actionKey,
  capturingControlKey,
  closeTopLobbyModal,
  isControlsSettingsOpen,
  keyboardEnabled,
}: UseLobbyKeyboardNavigationArgs) {
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const selectionStackRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const clearSelectedElement = () => {
      selectedElementRef.current?.classList.remove("keyboard-nav-selected");
      selectedElementRef.current = null;
    };

    if ((!keyboardEnabled && !isControlsSettingsOpen) || capturingControlKey) {
      selectionStackRef.current = [];
      clearSelectedElement();
      return;
    }

    const isUsableNavElement = (element: Element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.closest("[aria-hidden='true']")) return false;
      if (element instanceof HTMLButtonElement && element.disabled) return false;
      if (element.getAttribute("aria-disabled") === "true") return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none";
    };

    const getModalRoots = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(".upgrade-modal"),
      ).filter(isUsableNavElement);

    const getModalRoot = () => {
      const modalRoots = getModalRoots();
      return modalRoots[modalRoots.length - 1] ?? null;
    };

    const getModalNavElements = (root: HTMLElement) =>
      Array.from(
        root.querySelectorAll<HTMLElement>("button, a[href]"),
      ).filter(isUsableNavElement);

    const getLayerElements = (layer: string) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-keyboard-nav-layer="${layer}"]`,
        ),
      ).filter(isUsableNavElement);

    const getCurrentLayerIndex = () => {
      const currentLayer =
        selectedElementRef.current?.dataset.keyboardNavLayer ?? null;
      const index = currentLayer
        ? LOBBY_NAV_LAYERS.indexOf(
            currentLayer as (typeof LOBBY_NAV_LAYERS)[number],
          )
        : -1;
      return index >= 0 ? index : 0;
    };

    const getModalLayers = (root: HTMLElement) => {
      const layerNames = Array.from(
        new Set(
          Array.from(
            root.querySelectorAll<HTMLElement>("[data-keyboard-modal-layer]"),
          )
            .filter(isUsableNavElement)
            .map((element) => element.dataset.keyboardModalLayer)
            .filter((layer): layer is string => Boolean(layer)),
        ),
      );

      if (root.classList.contains("skin-picker-modal")) {
        return layerNames.sort((a, b) => {
          const order = (layer: string) => {
            if (layer === "token") return 0;
            if (layer === "tabs") return 1;
            if (layer.startsWith("skin-row-")) {
              return 2 + Number(layer.replace("skin-row-", ""));
            }
            if (layer === "close") return 1000;
            return 900;
          };
          return order(a) - order(b);
        });
      }

      return layerNames;
    };

    const getModalLayerElements = (root: HTMLElement, layer: string) =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          `[data-keyboard-modal-layer="${layer}"]`,
        ),
      ).filter(isUsableNavElement);

    const getCurrentModalLayerIndex = (
      root: HTMLElement,
      modalLayers: string[],
    ) => {
      const current = selectedElementRef.current;
      if (!current || !root.contains(current)) return 0;
      const layer = current.dataset.keyboardModalLayer ?? null;
      const index = layer ? modalLayers.indexOf(layer) : -1;
      return index >= 0 ? index : 0;
    };

    const getNearestLayerIndex = (fromIndex: number, direction: 1 | -1) => {
      for (
        let index = fromIndex + direction;
        index >= 0 && index < LOBBY_NAV_LAYERS.length;
        index += direction
      ) {
        if (getLayerElements(LOBBY_NAV_LAYERS[index]).length > 0) {
          return index;
        }
      }
      return fromIndex;
    };

    const setSelectedElement = (element: HTMLElement | null) => {
      selectedElementRef.current?.classList.remove("keyboard-nav-selected");
      selectedElementRef.current = element;
      element?.classList.add("keyboard-nav-selected");
      element?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    };

    const restorePreviousSelection = () => {
      while (selectionStackRef.current.length > 0) {
        const previous = selectionStackRef.current.pop() ?? null;
        if (previous && previous.isConnected && isUsableNavElement(previous)) {
          setSelectedElement(previous);
          return true;
        }
      }

      if (
        selectedElementRef.current &&
        !selectedElementRef.current.isConnected
      ) {
        clearSelectedElement();
      }

      return false;
    };

    const getCenter = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };

    const pickClosestByX = (elements: HTMLElement[], from: HTMLElement) => {
      const origin = getCenter(from);
      let best = elements[0] ?? null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const element of elements) {
        const center = getCenter(element);
        const distance = Math.abs(center.x - origin.x);
        if (distance < bestDistance) {
          best = element;
          bestDistance = distance;
        }
      }
      return best;
    };

    const pickNextElement = (
      current: HTMLElement,
      elements: HTMLElement[],
      key: string,
    ) => {
      const origin = getCenter(current);
      const vertical = key === "ArrowUp" || key === "ArrowDown";
      const direction = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
      let best: { element: HTMLElement; score: number } | null = null;

      for (const element of elements) {
        if (element === current) continue;
        const center = getCenter(element);
        const primary = vertical
          ? (center.y - origin.y) * direction
          : (center.x - origin.x) * direction;
        if (primary <= 4) continue;
        const secondary = vertical
          ? Math.abs(center.x - origin.x)
          : Math.abs(center.y - origin.y);
        const score = primary * 1000 + secondary;
        if (!best || score < best.score) {
          best = { element, score };
        }
      }

      return best?.element ?? current;
    };

    const pickNextLayeredElement = (
      current: HTMLElement,
      layerElements: HTMLElement[],
      key: string,
    ) => {
      const currentIndex = layerElements.indexOf(current);
      if (currentIndex < 0) return layerElements[0] ?? current;
      const direction = key === "ArrowLeft" ? -1 : 1;
      const nextIndex =
        (currentIndex + direction + layerElements.length) %
        layerElements.length;
      return layerElements[nextIndex];
    };

    const adjustRangeInput = (
      element: HTMLElement,
      direction: 1 | -1,
    ): boolean => {
      if (!(element instanceof HTMLInputElement)) return false;
      if (element.type !== "range") return false;

      if (direction > 0) {
        element.stepUp();
      } else {
        element.stepDown();
      }

      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      const modalRoot = getModalRoot();
      const modalElements = modalRoot ? getModalNavElements(modalRoot) : [];
      const firstLayerElements = getLayerElements(LOBBY_NAV_LAYERS[0]);

      if (event.code === actionKey) {
        const previousModalCount = getModalRoots().length;
        if (closeTopLobbyModal()) {
          event.preventDefault();
          window.requestAnimationFrame(() => {
            if (getModalRoots().length < previousModalCount) {
              restorePreviousSelection();
            }
          });
        }
        return;
      }

      if (!modalRoot && firstLayerElements.length === 0) {
        clearSelectedElement();
        return;
      }

      if (ARROW_KEYS.has(event.key)) {
        event.preventDefault();
        if (modalRoot) {
          const modalLayers = getModalLayers(modalRoot);
          if (modalLayers.length > 0) {
            const currentLayerIndex = getCurrentModalLayerIndex(
              modalRoot,
              modalLayers,
            );
            const currentLayer = modalLayers[currentLayerIndex];
            const currentLayerElements = getModalLayerElements(
              modalRoot,
              currentLayer,
            );
            const current = currentLayerElements.includes(
              selectedElementRef.current!,
            )
              ? selectedElementRef.current!
              : currentLayerElements[0];

            if (!current) return;

            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              if (
                adjustRangeInput(
                  current,
                  event.key === "ArrowRight" ? 1 : -1,
                )
              ) {
                return;
              }

              setSelectedElement(
                pickNextLayeredElement(current, currentLayerElements, event.key),
              );
              return;
            }

            const direction = event.key === "ArrowDown" ? 1 : -1;
            const nextLayerIndex = Math.min(
              Math.max(currentLayerIndex + direction, 0),
              modalLayers.length - 1,
            );
            const nextLayerElements = getModalLayerElements(
              modalRoot,
              modalLayers[nextLayerIndex],
            );
            setSelectedElement(pickClosestByX(nextLayerElements, current));
            return;
          }

          const current = modalElements.includes(selectedElementRef.current!)
            ? selectedElementRef.current!
            : modalElements[0];
          setSelectedElement(
            selectedElementRef.current
              ? pickNextElement(current, modalElements, event.key)
              : current,
          );
          return;
        }

        if (!selectedElementRef.current) {
          setSelectedElement(firstLayerElements[0]);
          return;
        }

        const currentLayerIndex = getCurrentLayerIndex();
        const currentLayer = LOBBY_NAV_LAYERS[currentLayerIndex];
        const currentLayerElements = getLayerElements(currentLayer);
        const current = currentLayerElements.includes(selectedElementRef.current)
          ? selectedElementRef.current
          : (currentLayerElements[0] ?? firstLayerElements[0]);

        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          setSelectedElement(
            pickNextLayeredElement(current, currentLayerElements, event.key),
          );
          return;
        }

        const nextLayerIndex = getNearestLayerIndex(
          currentLayerIndex,
          event.key === "ArrowDown" ? 1 : -1,
        );
        const nextLayerElements = getLayerElements(
          LOBBY_NAV_LAYERS[nextLayerIndex],
        );
        setSelectedElement(pickClosestByX(nextLayerElements, current));
        return;
      }

      if (event.code === "Space" && selectedElementRef.current) {
        const selected = selectedElementRef.current;
        const previousModalCount = getModalRoots().length;
        event.preventDefault();
        selected.click();

        window.requestAnimationFrame(() => {
          const nextModalCount = getModalRoots().length;

          if (
            nextModalCount > previousModalCount &&
            selected.isConnected &&
            isUsableNavElement(selected)
          ) {
            selectionStackRef.current.push(selected);
            return;
          }

          if (nextModalCount < previousModalCount) {
            restorePreviousSelection();
          }
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    actionKey,
    capturingControlKey,
    closeTopLobbyModal,
    isControlsSettingsOpen,
    keyboardEnabled,
  ]);
}
