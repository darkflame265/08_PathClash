import { useCallback, useEffect, useState } from "react";

import {
  CONTROLS_SETTINGS_CHANGED_EVENT,
  loadControllerControlsSettings,
  loadKeyboardControlsSettings,
  saveControllerControlsSettings,
  saveKeyboardControlsSettings,
  type AbilitySkillSlotKey,
  type ControllerControlsSettings,
  type KeyboardControlsSettings,
} from "../../settings/controls";

export type CapturingControlKey =
  | AbilitySkillSlotKey
  | "gameAction"
  | "selectAction"
  | null;
export type CapturingControllerButton =
  | AbilitySkillSlotKey
  | "gameAction"
  | "selectAction"
  | null;

type KeyboardControlsUpdater =
  | KeyboardControlsSettings
  | ((current: KeyboardControlsSettings) => KeyboardControlsSettings);
type ControllerControlsUpdater =
  | ControllerControlsSettings
  | ((current: ControllerControlsSettings) => ControllerControlsSettings);

export function useKeyboardControlsSettings() {
  const [keyboardControls, setKeyboardControls] = useState(
    loadKeyboardControlsSettings,
  );
  const [controllerControls, setControllerControls] = useState(
    loadControllerControlsSettings,
  );
  const [capturingControlKey, setCapturingControlKey] =
    useState<CapturingControlKey>(null);
  const [capturingControllerButton, setCapturingControllerButton] =
    useState<CapturingControllerButton>(null);

  const updateKeyboardControls = useCallback(
    (updater: KeyboardControlsUpdater) => {
      setKeyboardControls((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        saveKeyboardControlsSettings(next);
        return next;
      });
    },
    [],
  );

  const updateControllerControls = useCallback(
    (updater: ControllerControlsUpdater) => {
      setControllerControls((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        saveControllerControlsSettings(next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!capturingControlKey) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === "Escape") {
        setCapturingControlKey(null);
        return;
      }

      updateKeyboardControls((current) => ({
        ...current,
        ...(capturingControlKey === "gameAction"
          ? { gameActionKey: event.code }
          : capturingControlKey === "selectAction"
            ? { selectActionKey: event.code }
            : {
                abilitySkillKeys: {
                  ...current.abilitySkillKeys,
                  [capturingControlKey]: event.code,
                },
              }),
      }));
      setCapturingControlKey(null);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [capturingControlKey, updateKeyboardControls]);

  useEffect(() => {
    if (!capturingControllerButton) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setCapturingControllerButton(null);
    };

    let raf = 0;
    let wasAnyButtonPressed = true;

    const tick = () => {
      const gamepad = navigator.getGamepads().find(Boolean);
      const pressedIndex = gamepad?.buttons.findIndex(
        (button) => button.pressed,
      );

      if (pressedIndex === undefined || pressedIndex < 0) {
        wasAnyButtonPressed = false;
      } else if (!wasAnyButtonPressed) {
        updateControllerControls((current) => ({
          ...current,
          ...(capturingControllerButton === "gameAction"
            ? { gameActionButton: pressedIndex }
            : capturingControllerButton === "selectAction"
              ? { selectActionButton: pressedIndex }
              : {
                  abilitySkillButtons: {
                    ...current.abilitySkillButtons,
                    [capturingControllerButton]: pressedIndex,
                  },
                }),
        }));
        setCapturingControllerButton(null);
        return;
      }

      raf = window.requestAnimationFrame(tick);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.cancelAnimationFrame(raf);
    };
  }, [capturingControllerButton, updateControllerControls]);

  useEffect(() => {
    const syncControls = () => {
      setKeyboardControls(loadKeyboardControlsSettings());
      setControllerControls(loadControllerControlsSettings());
    };

    window.addEventListener(CONTROLS_SETTINGS_CHANGED_EVENT, syncControls);
    window.addEventListener("storage", syncControls);
    return () => {
      window.removeEventListener(CONTROLS_SETTINGS_CHANGED_EVENT, syncControls);
      window.removeEventListener("storage", syncControls);
    };
  }, []);

  return {
    capturingControlKey,
    capturingControllerButton,
    controllerControls,
    keyboardControls,
    setCapturingControlKey,
    setCapturingControllerButton,
    updateControllerControls,
    updateKeyboardControls,
  };
}
