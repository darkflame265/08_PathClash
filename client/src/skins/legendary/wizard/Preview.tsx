import "./preview.css";

const PREVIEW_TICK_ANGLES = Array.from({ length: 8 }, (_, i) => i * 45);
const PREVIEW_ARM_ANGLES  = Array.from({ length: 6 }, (_, i) => i * 60);

export function WizardPreview() {
  return (
    <span className="wizard-preview-scale" aria-hidden="true">
      <span className="wizard-preview-wrap">
        <span className="wizard-preview-outer-ring" />
        {PREVIEW_TICK_ANGLES.map((angle) => (
          <span
            key={angle}
            className="wizard-preview-tick"
            style={{ ["--wizard-tick-angle" as string]: `${angle}deg` }}
          />
        ))}
        <span className="wizard-preview-mid-ring" />
        <span className="wizard-preview-diamond wizard-preview-d1" />
        <span className="wizard-preview-diamond wizard-preview-d2" />
        <span className="wizard-preview-diamond wizard-preview-d3" />
        <span className="wizard-preview-diamond wizard-preview-d4" />
        <span className="wizard-preview-triangle wizard-preview-tri-1">
          <svg className="wizard-preview-tri-svg" viewBox="0 0 120 120" aria-hidden="true">
            <polygon points="60,6 111,99 9,99" fill="none" stroke="rgba(190,70,255,0.65)" strokeWidth="2" />
          </svg>
        </span>
        <span className="wizard-preview-triangle wizard-preview-tri-2">
          <svg className="wizard-preview-tri-svg" viewBox="0 0 120 120" aria-hidden="true">
            <polygon points="60,114 9,21 111,21" fill="none" stroke="rgba(220,110,255,0.42)" strokeWidth="1.5" />
          </svg>
        </span>
        {PREVIEW_ARM_ANGLES.map((angle) => (
          <span
            key={angle}
            className="wizard-preview-arm"
            style={{ ["--wizard-arm-angle" as string]: `${angle}deg` }}
          >
            <span className="wizard-preview-arm-inner" />
          </span>
        ))}
        <span className="wizard-preview-dot wizard-preview-dot-1" />
        <span className="wizard-preview-dot wizard-preview-dot-2" />
        <span className="wizard-preview-dot wizard-preview-dot-3" />
        <span className="wizard-preview-core" />
      </span>
    </span>
  );
}
