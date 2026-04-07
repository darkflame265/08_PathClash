import "./preview.css";

export function ArcReactorPreview() {
  return (
    <span className="skin-preview-arc-reactor-orb" aria-hidden="true">
      <span className="skin-preview-arc-reactor-scale">
        <span className="skin-preview-arc-hex-wrap">
          <span className="skin-preview-arc-hex-layer skin-preview-arc-hex-layer-1">
            <svg className="skin-preview-arc-hex-svg" viewBox="0 0 230 230" aria-hidden="true">
              <polygon
                points="115,8 208,60.5 208,169.5 115,222 22,169.5 22,60.5"
                fill="none"
                stroke="rgba(255,150,0,0.6)"
                strokeWidth="6"
                strokeDasharray="14 7"
              />
            </svg>
          </span>
          <span className="skin-preview-arc-hex-layer skin-preview-arc-hex-layer-2">
            <svg className="skin-preview-arc-hex-svg" viewBox="0 0 162 162" aria-hidden="true">
              <polygon
                points="81,6 150,44 150,118 81,156 12,118 12,44"
                fill="none"
                stroke="rgba(255,115,0,0.55)"
                strokeWidth="8"
              />
            </svg>
          </span>
          <span className="skin-preview-arc-hex-layer skin-preview-arc-hex-layer-3">
            <svg className="skin-preview-arc-hex-svg" viewBox="0 0 104 104" aria-hidden="true">
              <polygon
                points="52,4 96,28 96,76 52,100 8,76 8,28"
                fill="none"
                stroke="rgba(255,195,0,0.9)"
                strokeWidth="6"
              />
            </svg>
          </span>
          <span className="skin-preview-arc-hex-core" />
        </span>
      </span>
    </span>
  );
}
