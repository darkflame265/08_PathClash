export type AbilitySkillSlotKey = "slot1" | "slot2" | "slot3";

export type KeyboardControlsSettings = {
  keyboardEnabled: boolean;
  abilitySkillKeys: Record<AbilitySkillSlotKey, string>;
  gameActionKey: string;
  selectActionKey: string;
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

const SLOT_KEYS: AbilitySkillSlotKey[] = ["slot1", "slot2", "slot3"];

const normalizeCode = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

export function loadKeyboardControlsSettings(): KeyboardControlsSettings {
  if (typeof window === "undefined") {
    return DEFAULT_KEYBOARD_CONTROLS_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(CONTROLS_SETTINGS_KEY);
    if (!raw) return DEFAULT_KEYBOARD_CONTROLS_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<KeyboardControlsSettings> & {
      abilitySkillKeys?: Partial<Record<AbilitySkillSlotKey, string>>;
      gameActionKey?: string;
      selectActionKey?: string;
    };

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
  } catch {
    return DEFAULT_KEYBOARD_CONTROLS_SETTINGS;
  }
}

export function saveKeyboardControlsSettings(
  settings: KeyboardControlsSettings,
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    CONTROLS_SETTINGS_KEY,
    JSON.stringify({ version: CONTROLS_SETTINGS_VERSION, ...settings }),
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
