import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
// 좌우에 노출되는 인접 아레나 이미지 너비 (px)
const PEEK = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const SKIN_META: Partial<Record<PieceSkin, { name: string; tier: string }>> = {
  plasma:        { name: "플라즈마",      tier: "common"    },
  gold_core:     { name: "골드 코어",     tier: "common"    },
  neon_pulse:    { name: "네온 펄스",     tier: "common"    },
  inferno:       { name: "인페르노",      tier: "common"    },
  quantum:       { name: "퀀텀",          tier: "common"    },
  cosmic:        { name: "코스믹",        tier: "rare"      },
  arc_reactor:   { name: "헥사곤",        tier: "rare"      },
  electric_core: { name: "일렉트릭 코어", tier: "rare"      },
  wizard:        { name: "위저드",        tier: "legendary" },
  atomic:        { name: "아토믹",        tier: "legendary" },
  chronos:       { name: "크로노스",      tier: "legendary" },
  sun:           { name: "썬",            tier: "legendary" },
};

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

function ArenaSlide({
  arenaNum,
  slideWidth,
  highestArena,
  currentRating,
}: {
  arenaNum: number;
  slideWidth: number;
  highestArena: number;
  currentRating: number;
}) {
  const range = ARENA_RANGES.find((r) => r.arena === arenaNum)!;
  const gaugePct =
    arenaNum < highestArena
      ? 100
      : arenaNum === highestArena
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

  return (
    <div className="arena-gallery-slide" style={{ width: slideWidth }}>
      <img
        src={`/arena/arena${arenaNum}.png`}
        alt={`${range.label} ${range.themeName}`}
        onError={(e) => {
          if (e.currentTarget.src.endsWith("/arena/arena6.png")) return;
          e.currentTarget.src = "/arena/arena6.png";
        }}
      />
      <LobbyArenaOverlay arena={arenaNum} />
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
    </div>
  );
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
  const [containerWidth, setContainerWidth] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 초기 렌더 직후 동기 측정 (FOUC 방지)
  useLayoutEffect(() => {
    if (viewportRef.current) {
      setContainerWidth(viewportRef.current.offsetWidth);
    }
  }, []);

  // 모달 리사이즈 대응
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) clearTimeout(animTimerRef.current);
    };
  }, []);

  // slideWidth: viewport 너비 - 좌우 PEEK
  // trackBaseOffset: 현재 아레나의 왼쪽 끝이 viewport x=PEEK에 오도록
  const slideWidth = Math.max(0, containerWidth - 2 * PEEK);
  const viewIndex = Math.max(
    0,
    ARENA_RANGES.findIndex((r) => r.arena === viewArena),
  );
  const trackBaseOffset = slideWidth > 0 ? PEEK - viewIndex * slideWidth : 0;

  const range = ARENA_RANGES[viewIndex] ?? ARENA_RANGES[0];
  const rewardSkins = ARENA_REWARD_SKINS[viewArena] ?? [];

  function startDrag(clientX: number) {
    if (isBouncing || isSnapping) return;
    if (animTimerRef.current !== null) {
      clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
    dragStartX.current = clientX;
    isDragging.current = true;
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
      animTimerRef.current = setTimeout(() => {
        setIsSnapping(false);
        animTimerRef.current = null;
      }, SNAP_DURATION_MS);
      return;
    }

    // delta > 0: 오른쪽 스와이프 → 이전 아레나
    // delta < 0: 왼쪽 스와이프 → 다음 아레나
    if (slideWidth <= 0) {
      setIsSnapping(true);
      setDragOffset(0);
      animTimerRef.current = setTimeout(() => {
        setIsSnapping(false);
        animTimerRef.current = null;
      }, SNAP_DURATION_MS);
      return;
    }

    const direction = delta > 0 ? -1 : 1;
    const slidesMoved = Math.max(1, Math.round(Math.abs(delta) / slideWidth));
    const targetIndex = clamp(
      viewIndex + direction * slidesMoved,
      0,
      ARENA_RANGES.length - 1,
    );

    if (targetIndex === viewIndex) {
      setDragOffset(0);
      setIsBouncing(true);
      animTimerRef.current = setTimeout(() => {
        setIsBouncing(false);
        animTimerRef.current = null;
      }, BOUNCE_DURATION_MS);
      return;
    }

    // 모든 아레나가 같은 트랙에 있으므로 target arena로 바로 스냅해도 재마운트 깜빡임이 없다.
    setIsSnapping(true);
    setViewArena(ARENA_RANGES[targetIndex].arena);
    setDragOffset(0);
    animTimerRef.current = setTimeout(() => {
      setIsSnapping(false);
      animTimerRef.current = null;
    }, SNAP_DURATION_MS);
  }

  function cancelDrag() {
    if (!isDragging.current) return;
    isDragging.current = false;
    dragStartX.current = null;
    if (animTimerRef.current !== null) clearTimeout(animTimerRef.current);
    setIsSnapping(true);
    setDragOffset(0);
    animTimerRef.current = setTimeout(() => {
      setIsSnapping(false);
      animTimerRef.current = null;
    }, SNAP_DURATION_MS);
  }

  return (
    <div className="upgrade-modal-backdrop" onClick={onClose}>
      <div
        className="upgrade-modal skin-modal arena-gallery-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 슬라이드 뷰포트: overflow:hidden으로 좌우 peek 클리핑 */}
        <div
          ref={viewportRef}
          className={`arena-gallery-viewport${isBouncing ? " is-bouncing" : ""}`}
          aria-label={`${range.label} ${range.themeName}`}
          onTouchStart={(e) => startDrag(e.touches[0].clientX)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientX)}
          onTouchEnd={(e) => endDrag(e.changedTouches[0].clientX)}
          onMouseDown={(e) => startDrag(e.clientX)}
          onMouseMove={(e) => moveDrag(e.clientX)}
          onMouseUp={(e) => endDrag(e.clientX)}
          onMouseLeave={cancelDrag}
        >
          <div
            className={`arena-gallery-track${isSnapping ? " is-snapping" : ""}`}
            style={{ transform: `translateX(${trackBaseOffset + dragOffset}px)` }}
          >
            {ARENA_RANGES.map((arena) => (
              <ArenaSlide
                key={arena.arena}
                arenaNum={arena.arena}
                slideWidth={slideWidth}
                highestArena={highestArena}
                currentRating={currentRating}
              />
            ))}
          </div>
        </div>

        {/* 해금 스킨 영역 (스킨 없어도 공간 유지) */}
        <div className="arena-gallery-rewards">
          <span className="arena-gallery-rewards-label">해금 스킨</span>
          <div className="arena-gallery-skin-grid">
            {rewardSkins.map((skinId) => {
              const meta = SKIN_META[skinId];
              return (
                <div key={skinId} className="skin-option-card skin-picker-card arena-gallery-skin-card">
                  <span className="skin-preview skin-picker-preview" aria-hidden="true">
                    {renderSkinPreview(skinId)}
                  </span>
                  <span className="skin-option-copy skin-picker-copy">
                    <strong className={`skin-name-tier-${meta?.tier ?? "common"}`}>
                      {meta?.name ?? skinId}
                    </strong>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="arena-gallery-actions">
          <button className="lobby-btn primary" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
