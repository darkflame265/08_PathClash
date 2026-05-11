import type { PieceSkin } from '../../../types/game.types';

export interface FriendEntry {
  userId: string;
  nickname: string;
  currentRating: number;
  equippedSkin: PieceSkin;
  status: 'online' | 'in_game' | 'offline';
}

export interface RequestEntry {
  id: string;
  senderId: string;
  senderNickname: string;
  createdAt: string;
}

export interface FriendProfile {
  userId: string;
  nickname: string;
  currentRating: number;
  equippedSkin: PieceSkin;
  wins: number;
  losses: number;
  ownedSkinCount: number;
  totalSkinCount: number;
  completedAchievementCount: number;
  totalAchievementCount: number;
}
