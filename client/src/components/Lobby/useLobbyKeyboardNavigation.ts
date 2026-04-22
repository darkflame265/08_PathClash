import { useEffect, useRef } from "react";

type UseLobbyKeyboardNavigationArgs = {
  actionKey: string;
  controllerActionButton?: number;
  controllerEnabled?: boolean;
  controllerSelectButton?: number;
  capturingControlKey: unknown;
  closeTopLobbyModal: () => boolean;
  isAnyModalOpen: boolean;
  isControlsSettingsOpen: boolean;
  keyboardEnabled: boolean;
  selectKey: string;
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
  controllerActionButton,
  controllerEnabled = false,
  controllerSelectButton,
  capturingControlKey,
  closeTopLobbyModal,
  isAnyModalOpen,
  isControlsSettingsOpen,
  keyboardEnabled,
  selectKey,
}: UseLobbyKeyboardNavigationArgs) {
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const selectionStackRef = useRef<HTMLElement[]>([]);
  const controllerInputRef = useRef("");
  const controllerInputAtRef = useRef(0);

  useEffect(() => {
    const clearSelectedElement = () => {
      selectedElementRef.current?.classList.remove("keyboard-nav-selected");
      selectedElementRef.current = null;
    };

    const inputEnabled =
      keyboardEnabled || controllerEnabled || isControlsSettingsOpen || isAnyModalOpen;

    if (!inputEnabled || capturingControlKey) {
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

    const handleAction = () => {
      const modalRoot = getModalRoot();
      const previousModalCount = getModalRoots().length;
      if (!closeTopLobbyModal()) return false;

      window.requestAnimationFrame(() => {
        if (getModalRoots().length < previousModalCount) {
          restorePreviousSelection();
        }
      });
      return Boolean(modalRoot || previousModalCount > 0);
    };

    const handleArrow = (key: string) => {
      const modalRoot = getModalRoot();
      const modalElements = modalRoot ? getModalNavElements(modalRoot) : [];
      const firstLayerElements = getLayerElements(LOBBY_NAV_LAYERS[0]);

      if (!modalRoot && firstLayerElements.length === 0) {
        clearSelectedElement();
        return false;
      }

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

          if (!current) return false;

          if (key === "ArrowLeft" || key === "ArrowRight") {
            if (
              adjustRangeInput(current, key === "ArrowRight" ? 1 : -1)
            ) {
              return true;
            }

            setSelectedElement(
              pickNextLayeredElement(current, currentLayerElements, key),
            );
            return true;
          }

          const direction = key === "ArrowDown" ? 1 : -1;
          const nextLayerIndex = Math.min(
            Math.max(currentLayerIndex + direction, 0),
            modalLayers.length - 1,
          );
          const nextLayerElements = getModalLayerElements(
            modalRoot,
            modalLayers[nextLayerIndex],
          );
          setSelectedElement(pickClosestByX(nextLayerElements, current));
          return true;
        }

        const current = modalElements.includes(selectedElementRef.current!)
          ? selectedElementRef.current!
          : modalElements[0];
        setSelectedElement(
          selectedElementRef.current
            ? pickNextElement(current, modalElements, key)
            : current,
        );
        return true;
      }

      if (!selectedElementRef.current) {
        setSelectedElement(firstLayerElements[0]);
        return true;
      }

      const currentLayerIndex = getCurrentLayerIndex();
      const currentLayer = LOBBY_NAV_LAYERS[currentLayerIndex];
      const currentLayerElements = getLayerElements(currentLayer);
      const current = currentLayerElements.includes(selectedElementRef.current)
        ? selectedElementRef.current
        : (currentLayerElements[0] ?? firstLayerElements[0]);

      if (key === "ArrowLeft" || key === "ArrowRight") {
        setSelectedElement(
          pickNextLayeredElement(current, currentLayerElements, key),
        );
        return true;
      }

      const nextLayerIndex = getNearestLayerIndex(
        currentLayerIndex,
        key === "ArrowDown" ? 1 : -1,
      );
      const nextLayerElements = getLayerElements(
        LOBBY_NAV_LAYERS[nextLayerIndex],
      );
      setSelectedElement(pickClosestByX(nextLayerElements, current));
      return true;
    };

    const handleSelect = () => {
      if (!selectedElementRef.current) return false;

      const selected = selectedElementRef.current;
      const previousModalCount = getModalRoots().length;
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

      if (event.code === actionKey && handleAction()) {
        event.preventDefault();
        return;
      }

      if (ARROW_KEYS.has(event.key) && handleArrow(event.key)) {
        event.preventDefault();
        return;
      }

      if (event.code === selectKey && handleSelect()) {
        event.preventDefault();
      }
    };

    let raf = 0;
    const getGamepadDirection = (gamepad: Gamepad) => {
      if (gamepad.buttons[12]?.pressed) return "ArrowUp";
      if (gamepad.buttons[13]?.pressed) return "ArrowDown";
      if (gamepad.buttons[14]?.pressed) return "ArrowLeft";
      if (gamepad.buttons[15]?.pressed) return "ArrowRight";

      const horizontal = gamepad.axes[0] ?? 0;
      const vertical = gamepad.axes[1] ?? 0;
      if (Math.abs(horizontal) > Math.abs(vertical)) {
        if (horizontal <= -0.55) return "ArrowLeft";
        if (horizontal >= 0.55) return "ArrowRight";
      }
      if (vertical <= -0.55) return "ArrowUp";
      if (vertical >= 0.55) return "ArrowDown";
      return "";
    };

    const shouldAcceptControllerInput = (input: string, now: number) => {
      if (!input) {
        controllerInputRef.current = "";
        return false;
      }

      const delay =
        input === controllerInputRef.current
          ? input.startsWith("button:")
            ? Number.POSITIVE_INFINITY
            : 170
          : 0;
      if (now - controllerInputAtRef.current < delay) return false;
      controllerInputRef.current = input;
      controllerInputAtRef.current = now;
      return true;
    };

    const pollController = () => {
      if (controllerEnabled || isControlsSettingsOpen || isAnyModalOpen) {
        const gamepad = navigator.getGamepads().find(Boolean);
        if (gamepad) {
          const direction = getGamepadDirection(gamepad);
          const input =
            direction ||
            (controllerActionButton !== undefined &&
            gamepad.buttons[controllerActionButton]?.pressed
              ? `button:${controllerActionButton}`
              : controllerSelectButton !== undefined &&
                  gamepad.buttons[controllerSelectButton]?.pressed
                ? `button:${controllerSelectButton}`
                : "");

          if (shouldAcceptControllerInput(input, performance.now())) {
            if (direction) {
              handleArrow(direction);
            } else if (input === `button:${controllerActionButton}`) {
              handleAction();
            } else if (input === `button:${controllerSelectButton}`) {
              handleSelect();
            }
          }
        }
      }

      raf = window.requestAnimationFrame(pollController);
    };

    window.addEventListener("keydown", handleKeyDown);
    raf = window.requestAnimationFrame(pollController);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(raf);
    };
  }, [
    actionKey,
    capturingControlKey,
    closeTopLobbyModal,
    controllerActionButton,
    controllerEnabled,
    controllerSelectButton,
    isAnyModalOpen,
    isControlsSettingsOpen,
    keyboardEnabled,
    selectKey,
  ]);
}
