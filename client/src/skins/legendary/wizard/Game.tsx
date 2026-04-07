import "./game.css";

const WIZARD_TICK_ANGLES = Array.from({ length: 8 }, (_, i) => i * 45);
const WIZARD_ARM_ANGLES  = Array.from({ length: 6 }, (_, i) => i * 60);

export function WizardGame() {
  return (
    <div className="wizard-scale" aria-hidden="true">
      <div className="wizard-wrap">

        {/* 외곽 링 */}
        <div className="wizard-outer-ring" />

        {/* 틱 마크 8개 */}
        {WIZARD_TICK_ANGLES.map((angle) => (
          <div
            key={angle}
            className="wizard-tick"
            style={{ ["--wizard-tick-angle" as string]: `${angle}deg` }}
          />
        ))}

        {/* 중간 링 (역회전) */}
        <div className="wizard-mid-ring" />

        {/* 다이아 노드 4개 (중간 링 공전) */}
        <div className="wizard-diamond wizard-d1" />
        <div className="wizard-diamond wizard-d2" />
        <div className="wizard-diamond wizard-d3" />
        <div className="wizard-diamond wizard-d4" />

        {/* 내부 삼각형 두 개 (헥사그램) */}
        <div className="wizard-triangle wizard-tri-1">
          <svg className="wizard-tri-svg" viewBox="0 0 120 120" aria-hidden="true">
            <polygon
              points="60,6 111,99 9,99"
              fill="none"
              stroke="rgba(190,70,255,0.65)"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="wizard-triangle wizard-tri-2">
          <svg className="wizard-tri-svg" viewBox="0 0 120 120" aria-hidden="true">
            <polygon
              points="60,114 9,21 111,21"
              fill="none"
              stroke="rgba(220,110,255,0.42)"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        {/* 에너지 암 6개 */}
        {WIZARD_ARM_ANGLES.map((angle) => (
          <div
            key={angle}
            className="wizard-arm"
            style={{ ["--wizard-arm-angle" as string]: `${angle}deg` }}
          >
            <div className="wizard-arm-inner" />
          </div>
        ))}

        {/* 공전 점 3개 */}
        <div className="wizard-dot wizard-dot-1" />
        <div className="wizard-dot wizard-dot-2" />
        <div className="wizard-dot wizard-dot-3" />

        {/* 코어 */}
        <div className="wizard-core" />

      </div>
    </div>
  );
}
