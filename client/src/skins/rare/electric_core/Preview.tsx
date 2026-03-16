import "./preview.css";
import { ElectricCoreCanvas } from "./ElectricCoreCanvas";

export function ElectricCorePreview() {
  return (
    <span className="skin-preview-electric_core-orb" aria-hidden="true">
      <ElectricCoreCanvas className="skin-preview-electric_core-canvas" />
    </span>
  );
}
