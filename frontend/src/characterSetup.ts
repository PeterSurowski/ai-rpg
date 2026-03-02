import { StoryCharacters } from './types';

const SETUP_KEY = 'ai_rpg_city_of_doors_setup';

export function saveCharacterSetup(characters: StoryCharacters) {
  localStorage.setItem(SETUP_KEY, JSON.stringify(characters));
}

export function getCharacterSetup(): StoryCharacters | null {
  const rawValue = localStorage.getItem(SETUP_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoryCharacters;
  } catch {
    return null;
  }
}

export function clearCharacterSetup() {
  localStorage.removeItem(SETUP_KEY);
}
