import "./game.css";

const ARC_REACTOR_MARKS = Array.from({ length: 60 }, (_, index) => ({
  angle: index * 6,
  delay: -(index % 6) * 0.22,
}));

export function ArcReactorGame() {
  return (
    <div className="arc-reactor-scale" aria-hidden="true">
      <div className="arc_reactor">
        <div className="case_container">
          <div className="e7">
            <div className="semi_arc_3 e5_1">
              <div className="semi_arc_3 e5_2">
                <div className="semi_arc_3 e5_3">
                  <div className="semi_arc_3 e5_4" />
                </div>
              </div>
            </div>
            <div className="core2" />
          </div>
          <ul className="marks">
            {ARC_REACTOR_MARKS.map((mark, index) => (
              <li
                key={`${mark.angle}-${index}`}
                className="arc-reactor-mark"
                style={{
                  ["--mark-angle" as string]: `${mark.angle}deg`,
                  ["--mark-delay" as string]: `${mark.delay}s`,
                }}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
