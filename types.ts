
export interface TranscriptEntry {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum AppState {
  IDLE = 'IDLE',
  SLEEP = 'SLEEP',
  STANDBY = 'STANDBY',
  CONNECTING = 'CONNECTING',
  LISTENING = 'LISTENING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR'
}

export enum Mood {
  NEUTRAL = 'NEUTRAL',
  HAPPY = 'HAPPY',
  SAD = 'SAD',
  SURPRISED = 'SURPRISED',
  THINKING = 'THINKING',
  ANGRY = 'ANGRY'
}
