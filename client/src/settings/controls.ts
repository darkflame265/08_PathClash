export type AbilitySkillSlotKey = "slot1" | "slot2" | "slot3";

export type KeyboardControlsSettings = {
  keyboardEnabled: boolean;
  abilitySkillKeys: Record<AbilitySkillSlotKey, string>;
  gameActionKey: string;
  selectActionKey: string;
};

export type ControllerControlsSettings = {
  controllerEnabled: boolean;
  abilitySkillButtons: Record<AbilitySkillSlotKey, number>;
  gameActionButton: number;
  selectActionButton: number;
};

export const CONTROLS_SETTINGS_CHANGED_EVENT = "pathclash-controls-changed";

const CONTROLS_SETTINGS_KEY = "pathclash.controls.v1";
const CONTROLS_SETTINGS_VERSION = 1;

export const DEFAULT_KEYBOARD_CONTROLS_SETTINGS: KeyboardControlsSettings = {
  keyboardEnabled: false,
  abilitySkillKeys: {
    slot1: "KeyQ",
    slot2: "KeyW",
    slot3: "KeyE",
  },
  gameActionKey: "KeyR",
  selectActionKey: "Space",
};

export const DEFAULT_CONTROLLER_CONTROLS_SETTINGS: ControllerControlsSettings = {
  controllerEnabled: false,
  abilitySkillButtons: {
    slot1: 2,
    slot2: 3,
    slot3: 1,
  },
  gameActionButton: 5,
  selectActionButton: 0,
};

const SLOT_KEYS: AbilitySkillSlotKey[] = ["slot1", "slot2", "slot3"];

const normalizeCode = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const normalizeButton = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;

const readRawControlsSettings = () => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CONTROLS_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<
      KeyboardControlsSettings & ControllerControlsSettings
    > & {
      abilitySkillKeys?: Partial<Record<AbilitySkillSlotKey, string>>;
      abilitySkillButtons?: Partial<Record<AbilitySkillSlotKey, number>>;
    };
  } catch {
    return null;
  }
};

export function loadKeyboardControlsSettings(): KeyboardControlsSettings {
  if (typeof window === "undefined") {
    return DEFAULT_KEYBOARD_CONTROLS_SETTINGS;
  }

  const parsed = readRawControlsSettings();
  if (!parsed) return DEFAULT_KEYBOARD_CONTROLS_SETTINGS;

  return {
    keyboardEnabled: parsed.keyboardEnabled === true,
    abilitySkillKeys: SLOT_KEYS.reduce(
      (next, slot) => ({
        ...next,
        [slot]: normalizeCode(
          parsed.abilitySkillKeys?.[slot],
          DEFAULT_KEYBOARD_CONTROLS_SETTINGS.abilitySkillKeys[slot],
        ),
      }),
      {} as Record<AbilitySkillSlotKey, string>,
    ),
    gameActionKey: normalizeCode(
      parsed.gameActionKey,
      DEFAULT_KEYBOARD_CONTROLS_SETTINGS.gameActionKey,
    ),
    selectActionKey: normalizeCode(
      parsed.selectActionKey,
      DEFAULT_KEYBOARD_CONTROLS_SETTINGS.selectActionKey,
    ),
  };
}

export function loadControllerControlsSettings(): ControllerControlsSettings {
  if (typeof window === "undefined") {
    return DEFAULT_CONTROLLER_CONTROLS_SETTINGS;
  }

  const parsed = readRawControlsSettings();
  if (!parsed) return DEFAULT_CONTROLLER_CONTROLS_SETTINGS;

  return {
    controllerEnabled: parsed.controllerEnabled === true,
    abilitySkillButtons: SLOT_KEYS.reduce(
      (next, slot) => ({
        ...next,
        [slot]: normalizeButton(
          parsed.abilitySkillButtons?.[slot],
          DEFAULT_CONTROLLER_CONTROLS_SETTINGS.abilitySkillButtons[slot],
        ),
      }),
      {} as Record<AbilitySkillSlotKey, number>,
    ),
    gameActionButton: normalizeButton(
      parsed.gameActionButton,
      DEFAULT_CONTROLLER_CONTROLS_SETTINGS.gameActionButton,
    ),
    selectActionButton: normalizeButton(
      parsed.selectActionButton,
      DEFAULT_CONTROLLER_CONTROLS_SETTINGS.selectActionButton,
    ),
  };
}

export function saveKeyboardControlsSettings(
  settings: KeyboardControlsSettings,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    CONTROLS_SETTINGS_KEY,
    JSON.stringify({
      ...readRawControlsSettings(),
      version: CONTROLS_SETTINGS_VERSION,
      ...settings,
    }),
  );
  window.dispatchEvent(new Event(CONTROLS_SETTINGS_CHANGED_EVENT));
}

export function saveControllerControlsSettings(
  settings: ControllerControlsSettings,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    CONTROLS_SETTINGS_KEY,
    JSON.stringify({
      ...readRawControlsSettings(),
      version: CONTROLS_SETTINGS_VERSION,
      ...settings,
    }),
  );
  window.dispatchEvent(new Event(CONTROLS_SETTINGS_CHANGED_EVENT));
}

export function getKeyboardCodeLabel(code: string) {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code === "Space") return "Space";
  if (code.startsWith("Arrow")) return code.replace("Arrow", "Arrow ");
  if (code.startsWith("Shift")) return code.replace("Shift", "Shift ");
  if (code.startsWith("Control")) return code.replace("Control", "Ctrl ");
  if (code.startsWith("Alt")) return code.replace("Alt", "Alt ");
  return code;
}

export type GamepadButtonLayout = "playstation" | "xbox" | "generic";

export function getConnectedGamepadButtonLayout(): GamepadButtonLayout {
  if (typeof navigator === "undefined" || !navigator.getGamepads) {
    return "playstation";
  }

  const gamepad = navigator.getGamepads().find(Boolean);
  const id = gamepad?.id.toLowerCase() ?? "";

  if (
    id.includes("xbox") ||
    id.includes("xinput") ||
    id.includes("microsoft")
  ) {
    return "xbox";
  }

  if (
    id.includes("playstation") ||
    id.includes("dualshock") ||
    id.includes("dualsense") ||
    id.includes("sony") ||
    id.includes("wireless controller")
  ) {
    return "playstation";
  }

  return "generic";
}

export function getGamepadButtonLabel(
  button: number,
  layout: GamepadButtonLayout = getConnectedGamepadButtonLayout(),
) {
  const playstationLabels: Record<number, string> = {
    0: "X",
    1: "O",
    2: "Square",
    3: "Triangle",
    4: "L1",
    5: "R1",
    6: "L2",
    7: "R2",
    8: "Share",
    9: "Options",
    10: "L3",
    11: "R3",
    12: "D-Pad Up",
    13: "D-Pad Down",
    14: "D-Pad Left",
    15: "D-Pad Right",
  };

  const xboxLabels: Record<number, string> = {
    0: "A",
    1: "B",
    2: "X",
    3: "Y",
    4: "LB",
    5: "RB",
    6: "LT",
    7: "RT",
    8: "View",
    9: "Menu",
    10: "LS",
    11: "RS",
    12: "D-Pad Up",
    13: "D-Pad Down",
    14: "D-Pad Left",
    15: "D-Pad Right",
  };

  const labels = layout === "xbox" ? xboxLabels : playstationLabels;
  return labels[button] ?? `Button ${button}`;
}
