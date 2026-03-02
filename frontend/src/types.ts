export type HistoryMessage = {
  role: 'assistant' | 'user';
  content: string;
};

export type CharacterProfile = {
  name: string;
  gender: string;
  background: string;
};

export type StoryCharacters = {
  player: CharacterProfile;
  support: CharacterProfile;
};