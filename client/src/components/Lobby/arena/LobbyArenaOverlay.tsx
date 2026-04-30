import { PyramidLobbyArena } from "./arena_1_pyramid/PyramidLobbyArena";

interface LobbyArenaOverlayProps {
  arena: number;
}

export function LobbyArenaOverlay({ arena }: LobbyArenaOverlayProps) {
  if (arena === 1) {
    return <PyramidLobbyArena />;
  }

  return null;
}
