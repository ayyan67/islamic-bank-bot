export interface ChallengePrompt {
  key: string;
  surah: string;
  arabicName: string;
  verse_count: number;
  description: string;
}

export interface DailyChallenge {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  promptKey: string;
  promptText: string;
  rewardAmount: number;
  challengeDate: string;
  lastPostedAt: string;
  status: 'active' | 'expired';
  createdAt: string;
}

export interface ChallengeCompletion {
  id: number;
  challengeId: number;
  userId: number;
  completedAt: string;
}

export interface CompleteResult {
  ok: true;
  rewardAmount: number;
  completionCount: number;
  challengeTitle: string;
}

export interface CompleteFailure {
  ok: false;
  reason: string;
}

export type CompleteChallengeResult = CompleteResult | CompleteFailure;

export interface ChallengeBan {
  id: number;
  guildId: string;
  userId: number;
  bannedByUserId: number;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export const SURAH_PROMPTS: readonly ChallengePrompt[] = [
  { key: 'fatiha', surah: 'Al-Fatiha', arabicName: 'الفاتحة', verse_count: 7, description: 'The Opening' },
  { key: 'ikhlas', surah: 'Al-Ikhlas', arabicName: 'الإخلاص', verse_count: 4, description: 'Sincerity' },
  { key: 'falaq', surah: 'Al-Falaq', arabicName: 'الفلق', verse_count: 5, description: 'The Daybreak' },
  { key: 'nas', surah: 'An-Nas', arabicName: 'الناس', verse_count: 6, description: 'Mankind' },
  { key: 'kawthar', surah: 'Al-Kawthar', arabicName: 'الكوثر', verse_count: 3, description: 'Abundance' },
  { key: 'asr', surah: 'Al-Asr', arabicName: 'العصر', verse_count: 3, description: 'Time' },
  { key: 'nasr', surah: 'An-Nasr', arabicName: 'النصر', verse_count: 3, description: 'Divine Support' },
  { key: 'masad', surah: 'Al-Masad', arabicName: 'المسد', verse_count: 5, description: 'Palm Fiber' },
  { key: 'kafirun', surah: 'Al-Kafirun', arabicName: 'الكافرون', verse_count: 6, description: 'The Disbelievers' },
  { key: 'quraysh', surah: 'Quraysh', arabicName: 'قريش', verse_count: 4, description: 'Quraysh' },
  { key: 'fil', surah: 'Al-Fil', arabicName: 'الفيل', verse_count: 5, description: 'The Elephant' },
  { key: 'humazah', surah: 'Al-Humazah', arabicName: 'الهمزة', verse_count: 9, description: 'The Slanderer' },
  { key: 'takathur', surah: 'At-Takathur', arabicName: 'التكاثر', verse_count: 8, description: 'Competition' },
  { key: 'qariah', surah: 'Al-Qariah', arabicName: 'القارعة', verse_count: 11, description: 'The Striking Hour' },
  { key: 'zilzal', surah: 'Az-Zilzal', arabicName: 'الزلزلة', verse_count: 8, description: 'The Earthquake' },
  { key: 'bayyinah', surah: 'Al-Bayyinah', arabicName: 'البينة', verse_count: 8, description: 'The Clear Evidence' },
  { key: 'qadr', surah: 'Al-Qadr', arabicName: 'القدر', verse_count: 5, description: 'The Night of Glory' },
  { key: 'alaq', surah: 'Al-Alaq', arabicName: 'العلق', verse_count: 19, description: 'The Clinging Clot' },
  { key: 'tin', surah: 'At-Tin', arabicName: 'التين', verse_count: 8, description: 'The Fig' },
  { key: 'sharh', surah: 'Ash-Sharh', arabicName: 'الشرح', verse_count: 8, description: 'The Relief' }
];
