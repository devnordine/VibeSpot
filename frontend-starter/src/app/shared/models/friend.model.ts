export type RelationStatus =
  | 'NONE'
  | 'FRIEND'
  | 'PENDING_SENT'
  | 'PENDING_RECEIVED';

export type SpotVisibility = 'PUBLIC' | 'FRIENDS' | 'PRIVATE';

export interface FriendUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  bio?: string;
  badges?: string[];
}

export interface UserSearchResult extends FriendUser {
  relationStatus: RelationStatus;
  requestId?: string;
}

export interface FriendRequest {
  id: string;
  from: FriendUser;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
}

export interface OutgoingRequest {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface FriendsOverview {
  friends: FriendUser[];
  incomingRequests: FriendRequest[];
  outgoingRequests: OutgoingRequest[];
}

export type FeedItemType = 'NEW_SPOT' | 'NEW_REVIEW' | 'NEW_LIST';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  actor: {
    id: string;
    name: string;
    avatar: string;
  };
  target: {
    id: string;
    title: string;
    category?: string;
    coverPhoto?: string;
    visibility?: SpotVisibility;
    spotsCount?: number;
  };
  summary: string;
  comment?: string;
  createdAt: string;
}

export interface SpotSharePayload {
  visibility?: SpotVisibility;
  sharedWith?: string[];
  addUserId?: string;
  removeUserId?: string;
}

export interface SharedSpotResult {
  id: string;
  title: string;
  visibility: SpotVisibility;
  sharedWith: string[];
  createdBy: string;
}