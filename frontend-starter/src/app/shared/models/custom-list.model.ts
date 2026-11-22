import { SpotVisibility } from './friend.model';

export interface ListCollaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface ListSpotSummary {
  id: string;
  title: string;
  category: string;
  moods: string[];
  budget: number;
  address: string;
  city: string;
  coverPhoto: string;
  ratingAverage: number;
  visibility?: SpotVisibility;
}

export interface CustomList {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  isPublic: boolean;
  collaborators: (ListCollaborator | string)[];
  spots: ListSpotSummary[];
  spotsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateListPayload {
  name: string;
  description?: string;
  isPublic?: boolean;
  collaborators?: string[];
}

export interface UpdateListPayload {
  name?: string;
  description?: string;
  isPublic?: boolean;
  collaborators?: string[];
}