import "./preview.css";

export function ArcReactorPreview() {
  return (
    <span className="skin-preview-arc_reactor-orb" aria-hidden="true">
      <span className="skin-preview-arc-scale">
        <span className="skin-preview-arc_reactor-wrap">
          <span className="skin-preview-case_container">
            <span className="skin-preview-e7">
              <span className="skin-preview-semi_arc_3 skin-preview-e5_1">
                <span className="skin-preview-semi_arc_3 skin-preview-e5_2">
                  <span className="skin-preview-semi_arc_3 skin-preview-e5_3">
                    <span className="skin-preview-semi_arc_3 skin-preview-e5_4" />
                  </span>
                </span>
              </span>
              <span className="skin-preview-core2" />
            </span>
            <span className="skin-preview-marks">
              {Array.from({ length: 60 }, (_, index) => (
                <span
                  key={`arc-preview-${index}`}
                  className="skin-preview-arc-mark"
                  style={{
                    ["--mark-angle" as string]: `${(index + 1) * 6}deg`,
                  }}
                />
              ))}
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
