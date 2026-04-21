import { useCallback, useEffect, useState } from "react";

import {
  CONTROLS_SETTINGS_CHANGED_EVENT,
  loadKeyboardControlsSettings,
  saveKeyboardControlsSettings,
  type AbilitySkillSlotKey,
  type KeyboardControlsSettings,
} from "../../settings/controls";

export type CapturingControlKey = AbilitySkillSlotKey | "gameAction" | null;

type KeyboardControlsUpdater =
  | KeyboardControlsSettings
  | ((current: KeyboardControlsSettings) => KeyboardControlsSettings);

export function useKeyboardControlsSettings() {
  const [keyboardControls, setKeyboardControls] = useState(
    loadKeyboardControlsSettings,
  );
  const [capturingControlKey, setCapturingControlKey] =
    useState<CapturingControlKey>(null);

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
    const syncControls = () => {
      setKeyboardControls(loadKeyboardControlsSettings());
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
    keyboardControls,
    setCapturingControlKey,
    updateKeyboardControls,
  };
}
