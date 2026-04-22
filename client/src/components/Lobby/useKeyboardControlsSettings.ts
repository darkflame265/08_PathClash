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
type ControlAction = Exclude<CapturingControlKey, null>;

type KeyboardControlsUpdater =
  | KeyboardControlsSettings
  | ((current: KeyboardControlsSettings) => KeyboardControlsSettings);
type ControllerControlsUpdater =
  | ControllerControlsSettings
  | ((current: ControllerControlsSettings) => ControllerControlsSettings);

const CONTROL_ACTIONS: ControlAction[] = [
  "slot1",
  "slot2",
  "slot3",
  "gameAction",
  "selectAction",
];

function getKeyboardControlValue(
  settings: KeyboardControlsSettings,
  action: ControlAction,
) {
  if (action === "gameAction") return settings.gameActionKey;
  if (action === "selectAction") return settings.selectActionKey;
  return settings.abilitySkillKeys[action];
}

function setKeyboardControlValue(
  settings: KeyboardControlsSettings,
  action: ControlAction,
  value: string,
) {
  if (action === "gameAction") {
    settings.gameActionKey = value;
    return;
  }
  if (action === "selectAction") {
    settings.selectActionKey = value;
    return;
  }
  settings.abilitySkillKeys[action] = value;
}

function swapKeyboardControlValue(
  current: KeyboardControlsSettings,
  target: ControlAction,
  nextValue: string,
) {
  const previousValue = getKeyboardControlValue(current, target);
  const next: KeyboardControlsSettings = {
    ...current,
    abilitySkillKeys: { ...current.abilitySkillKeys },
  };
  const duplicate = CONTROL_ACTIONS.find(
    (action) =>
      action !== target && getKeyboardControlValue(current, action) === nextValue,
  );

  setKeyboardControlValue(next, target, nextValue);
  if (duplicate) {
    setKeyboardControlValue(next, duplicate, previousValue);
  }
  return next;
}

function getControllerControlValue(
  settings: ControllerControlsSettings,
  action: ControlAction,
) {
  if (action === "gameAction") return settings.gameActionButton;
  if (action === "selectAction") return settings.selectActionButton;
  return settings.abilitySkillButtons[action];
}

function setControllerControlValue(
  settings: ControllerControlsSettings,
  action: ControlAction,
  value: number,
) {
  if (action === "gameAction") {
    settings.gameActionButton = value;
    return;
  }
  if (action === "selectAction") {
    settings.selectActionButton = value;
    return;
  }
  settings.abilitySkillButtons[action] = value;
}

function swapControllerControlValue(
  current: ControllerControlsSettings,
  target: ControlAction,
  nextValue: number,
) {
  const previousValue = getControllerControlValue(current, target);
  const next: ControllerControlsSettings = {
    ...current,
    abilitySkillButtons: { ...current.abilitySkillButtons },
  };
  const duplicate = CONTROL_ACTIONS.find(
    (action) =>
      action !== target &&
      getControllerControlValue(current, action) === nextValue,
  );

  setControllerControlValue(next, target, nextValue);
  if (duplicate) {
    setControllerControlValue(next, duplicate, previousValue);
  }
  return next;
}

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

      updateKeyboardControls((current) =>
        swapKeyboardControlValue(current, capturingControlKey, event.code),
      );
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
        updateControllerControls((current) =>
          swapControllerControlValue(
            current,
            capturingControllerButton,
            pressedIndex,
          ),
        );
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
