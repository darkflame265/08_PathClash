import { PyramidLobbyArena } from "./arena_6_pyramid/PyramidLobbyArena";

interface LobbyArenaOverlayProps {
  arena: number;
}

export function LobbyArenaOverlay({ arena }: LobbyArenaOverlayProps) {
  if (arena === 6) {
    return <PyramidLobbyArena />;
  }

  return null;
}
