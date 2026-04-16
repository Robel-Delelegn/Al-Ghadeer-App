import { resolveResourceUrl } from "@/utils/resources";

export interface ProfileEmail {
  address: string;
  isPrimary: boolean;
  info: string | null;
}

export interface ProfilePhone {
  number: string;
  isPrimary: boolean;
  info: string | null;
}

export interface Profile {
  id: string;
  firstName: string;
  lastName: string | null;
  emails: ProfileEmail[];
  phones: ProfilePhone[];
  profileImageUrl: string | null;
}

export const normalizeProfile = (profile: Profile): Profile => ({
  ...profile,
  profileImageUrl: resolveResourceUrl(profile.profileImageUrl),
});
