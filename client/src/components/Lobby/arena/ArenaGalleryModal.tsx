import { useRef, useState } from "react";

import { AtomicPreview } from "../../../skins/legendary/atomic/Preview";
import { ChronosPreview } from "../../../skins/legendary/chronos/Preview";
import { SunPreview } from "../../../skins/legendary/sun/Preview";
import { WizardPreview } from "../../../skins/legendary/wizard/Preview";
import { CosmicPreview } from "../../../skins/rare/cosmic/Preview";
import { ArcReactorPreview } from "../../../skins/rare/arc_reactor/Preview";
import { ElectricCorePreview } from "../../../skins/rare/electric_core/Preview";
import { PlasmaPreview } from "../../../skins/common/plasma/Preview";
import { GoldCorePreview } from "../../../skins/common/gold_core/Preview";
import { NeonPulsePreview } from "../../../skins/common/neon_pulse/Preview";
import { InfernoPreview } from "../../../skins/common/inferno/Preview";
import { QuantumPreview } from "../../../skins/common/quantum/Preview";

import { ARENA_RANGES, ARENA_REWARD_SKINS } from "../../../data/arenaCatalog";
import { LobbyArenaOverlay } from "./LobbyArenaOverlay";
import type { PieceSkin } from "../../../types/game.types";

import "./ArenaGalleryModal.css";

interface ArenaGalleryModalProps {
  highestArena: number;
  currentRating: number;
  onClose: () => void;
}

const DRAG_THRESHOLD = 50;
const BOUNCE_DURATION_MS = 480;
const SNAP_DURATION_MS = 280;

function renderSkinPreview(skinId: PieceSkin) {
  switch (skinId) {
    case "plasma":        return <PlasmaPreview />;
    case "gold_core":     return <GoldCorePreview />;
    case "neon_pulse":    return <NeonPulsePreview />;
    case "cosmic":        return <CosmicPreview />;
    case "inferno":       return <InfernoPreview />;
    case "arc_reactor":   return <ArcReactorPreview />;
    case "electric_core": return <ElectricCorePreview />;
    case "quantum":       return <QuantumPreview />;
    case "wizard":        return <WizardPreview />;
    case "atomic":        return <AtomicPreview ready={true} />;
    case "chronos":       return <ChronosPreview />;
    case "sun":           return <SunPreview />;
    default:              return null;
  }
}

export function ArenaGalleryModal({
  highestArena,
  currentRating,
  onClose,
}: ArenaGalleryModalProps) {
  const [viewArena, setViewArena] = useState(highestArena);
  const [dragOffset, setDragOffset] = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);

  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  const range = ARENA_RANGES.find((r) => r.arena === viewArena)!;
  const rewardSkins = ARENA_REWARD_SKINS[viewArena] ?? [];

  const gaugePct =
    viewArena < highestArena
      ? 100
      : viewArena === highestArena
        ? Math.min(
            100,
            Math.max(
              0,
              ((currentRating - range.minRating) /
                (range.maxRating - range.minRating)) *
                100,
            ),
          )
        : 0;

  function startDrag(clientX: number) {
    if (isBouncing) return;
    dragStartX.current = clientX;
    isDragging.current = true;
    setIsSnapping(false);
  }

  function moveDrag(clientX: number) {
    if (!isDragging.current || dragStartX.current === null) return;
    setDragOffset(clientX - dragStartX.current);
  }

  function endDrag(clientX: number) {
    if (!isDragging.current || dragStartX.current === null) return;
    isDragging.current = false;
    const delta = clientX - dragStartX.current;
    dragStartX.current = null;

    if (Math.abs(delta) < DRAG_THRESHOLD) {
      setIsSnapping(true);
      setDragOffset(0);
      setTimeout(() => setIsSnapping(false), SNAP_DURATION_MS);
      return;
    }

    const next = viewArena + (delta > 0 ? -1 : 1);
    setDragOffset(0);

    if (next < 1 || next > 10) {
      setIsBouncing(true);
      setTimeout(() => setIsBouncing(false), BOUNCE_DURATION_MS);
      return;
    }

    setViewArena(next);
  }

  function cancelDrag() {
    if (!isDragging.current) return;
    isDragging.current = false;
    dragStartX.current = null;
    setIsSnapping(true);
    setDragOffset(0);
    setTimeout(() => setIsSnapping(false), SNAP_DURATION_MS);
  }

  const showcaseTransform = isBouncing
    ? undefined
    : `translateX(${dragOffset}px)`;

  const showcaseClass = [
    "lobby-arena-showcase",
    "arena-gallery-showcase",
    isSnapping ? "is-snapping" : "",
    isBouncing ? "is-bouncing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="upgrade-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="upgrade-modal skin-modal arena-gallery-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <figure
          className={showcaseClass}
          style={{ transform: showcaseTransform }}
          aria-label={`${range.label} ${range.themeName}`}
          onTouchStart={(e) => startDrag(e.touches[0].clientX)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientX)}
          onTouchEnd={(e) => endDrag(e.changedTouches[0].clientX)}
          onMouseDown={(e) => startDrag(e.clientX)}
          onMouseMove={(e) => moveDrag(e.clientX)}
          onMouseUp={(e) => endDrag(e.clientX)}
          onMouseLeave={cancelDrag}
        >
          <img
            src={`/arena/arena${viewArena}.png`}
            alt={`${range.label} ${range.themeName}`}
            onError={(e) => {
              if (e.currentTarget.src.endsWith("/arena/arena6.png")) return;
              e.currentTarget.src = "/arena/arena6.png";
            }}
          />
          <LobbyArenaOverlay arena={viewArena} />
          <div className="arena-progress-bar-wrap" aria-hidden="true">
            <div className="arena-name-in-bar arena-gallery-name-bar">
              <span className="arena-gallery-label">{range.label}</span>
              <span>{range.themeName}</span>
            </div>
            <div className="arena-progress-labels">
              <span>{range.minRating}</span>
              <span>{range.maxRating}</span>
            </div>
            <div className="arena-progress-track">
              <div
                className="arena-progress-fill"
                style={{ width: `${gaugePct}%` }}
              />
            </div>
          </div>
        </figure>

        <div className="arena-gallery-rewards">
          <span className="arena-gallery-rewards-label">해금 스킨</span>
          <div className="arena-gallery-previews">
            {rewardSkins.map((skinId) => (
              <div key={skinId} className="arena-gallery-preview-item">
                <span
                  className={`skin-preview skin-preview-${skinId}`}
                  aria-hidden="true"
                >
                  {renderSkinPreview(skinId)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="arena-gallery-actions">
          <button
            className="lobby-btn primary"
            type="button"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
