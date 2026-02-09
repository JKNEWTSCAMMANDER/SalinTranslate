import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { AppState, TranscriptEntry, Mood } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';
import Orb from './components/Orb';
import Transcript from './components/Transcript';

const SYSTEM_INSTRUCTION = `
You are "SalinLive", a dedicated real-time voice-to-voice translation engine for English and Filipino.

CORE MISSION:
- ACT AS A TRANSLATOR. Do not engage in small talk unless you are translating it.
- If a user speaks English, immediately provide the Filipino translation.
- If a user speaks Filipino, immediately provide the English translation.

ENVIRONMENTAL NOISE PROTOCOL:
- FOCUS EXCLUSIVELY on the primary speaker in the foreground.
- COMPLETELY IGNORE background noise, distant voices, or music.
- If the input is unintelligible noise, remain silent.

EXPRESSIVE EMOTION PROTOCOL:
At the beginning of your response, ALWAYS prepend a mood tag in brackets.
Available tags: [HAPPY], [SAD], [SURPRISED], [ANGRY], [THINKING], [NEUTRAL].
`;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [mood, setMood] = useState<Mood>(Mood.NEUTRAL);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const currentInputTranscription = useRef<string>('');
  const currentOutputTranscription = useRef<string>('');
  const recognitionRef = useRef<any>(null);

  const stopConversation = useCallback((forceSleep = false) => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    
    if (forceSleep) {
      setState(AppState.SLEEP);
      setTimeout(() => {
        setState(AppState.IDLE);
        setMood(Mood.NEUTRAL);
      }, 5000);
    } else {
      setState(AppState.IDLE);
      setMood(Mood.NEUTRAL);
    }
  }, []);

  const startConversation = async () => {
    try {
      setState(AppState.CONNECTING);
      setErrorMessage(null);

      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      // 1. Initialize API Client
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key is missing in environment variables.");
      const ai = new GoogleGenAI({ apiKey });
      
      // 2. Initialize Audio Contexts
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      // Ensure contexts are active (browsers often start them suspended)
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      if (outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume();

      // 3. Request Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        } 
      });

      // 4. Connect to Live API
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setState(AppState.LISTENING);
            if (!audioContextRef.current) return;
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (event) => {
              const inputData = event.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent;
            const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (serverContent?.outputTranscription) {
              const text = serverContent.outputTranscription.text;
              if (text) {
                const moodMatch = text.match(/\[(HAPPY|SAD|SURPRISED|ANGRY|THINKING|NEUTRAL)\]/);
                if (moodMatch) {
                  setMood(moodMatch[1] as Mood);
                  currentOutputTranscription.current += text.replace(moodMatch[0], '').trim();
                } else {
                  currentOutputTranscription.current += text;
                }
              }
            } else if (serverContent?.inputTranscription) {
              const text = serverContent.inputTranscription.text;
              if (text) {
                currentInputTranscription.current += text;
                setState(AppState.LISTENING);
              }
            }

            if (serverContent?.turnComplete) {
              const output = currentOutputTranscription.current.trim();
              if (output) {
                setTranscripts(prev => [
                  ...prev,
                  { role: 'model' as const, text: output, timestamp: Date.now() }
                ]);
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
              if (sourcesRef.current.size === 0) {
                setState(AppState.LISTENING);
              }
            }

            if (audioData) {
              setState(AppState.SPEAKING);
              const ctx = outputAudioContextRef.current;
              if (!ctx) return;
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0 && state !== AppState.SLEEP) {
                  setState(AppState.LISTENING);
                }
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setState(AppState.LISTENING);
            }
          },
          onerror: (err) => {
            console.error('API Error:', err);
            setErrorMessage('Connection failed. Please check your API key.');
            setState(AppState.ERROR);
          },
          onclose: () => {
            if (state !== AppState.SLEEP) setState(AppState.IDLE);
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (error: any) {
      console.error('Initialization Error:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setErrorMessage('Microphone access was denied. Check site permissions.');
      } else {
        setErrorMessage(`Failed to start: ${error.message || 'Unknown error'}`);
      }
      setState(AppState.ERROR);
    }
  };

  const enableWakeWord = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const results = event.results;
      const lastMatch = results[results.length - 1][0].transcript.toLowerCase();
      const wakeWords = ["hey salin", "hi salin", "translate"];
      
      if (wakeWords.some(word => lastMatch.includes(word))) {
        startConversation();
        recognition.stop();
      }
    };

    recognition.onerror = () => setState(AppState.IDLE);
    recognition.onend = () => { if (state === AppState.STANDBY) recognition.start(); };

    recognitionRef.current = recognition;
    recognition.start();
    setState(AppState.STANDBY);
  }, [state]);

  const toggleStandby = () => {
    if (state === AppState.STANDBY) {
      recognitionRef.current?.stop();
      setState(AppState.IDLE);
    } else {
      enableWakeWord();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-slate-900 overflow-hidden shadow-2xl border-x border-slate-800 font-sans">
      <header className="px-6 py-4 bg-slate-900/95 backdrop-blur-xl border-b border-white/5 flex items-center justify-between sticky top-0 z-30">
        <div>
          <h1 className="text-xl font-black tracking-tight bg-gradient-to-br from-blue-400 via-indigo-400 to-yellow-400 bg-clip-text text-transparent italic">
            SALINLIVE
          </h1>
          <div className="flex items-center gap-1.5 opacity-20">
            <span className="text-[7px] text-blue-400 font-bold uppercase tracking-[0.2em]">En</span>
            <div className="w-[2px] h-[2px] rounded-full bg-slate-600"></div>
            <span className="text-[7px] text-yellow-500 font-bold uppercase tracking-[0.2em]">Ph</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
              state === AppState.LISTENING ? 'bg-cyan-400 shadow-[0_0_8px_cyan]' : 
              state === AppState.STANDBY ? 'bg-indigo-400 shadow-[0_0_8px_indigo]' :
              state === AppState.SPEAKING ? 'bg-rose-400 shadow-[0_0_8px_rose] scale-125' :
              'bg-slate-700'
            }`}></div>
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">{state}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="flex-[2] flex items-center justify-center relative">
          <Orb state={state} mood={mood} />
          {state === AppState.SPEAKING && (
             <div className="absolute top-4 px-3 py-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm animate-pulse">
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Translating...</span>
             </div>
          )}
        </div>

        <div className="flex-[3] flex flex-col overflow-hidden px-4 mb-24 z-20">
          <Transcript entries={transcripts} />
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-8 py-6 flex items-center justify-between bg-gradient-to-t from-slate-950 via-slate-950 to-transparent z-30">
          <button
            onClick={toggleStandby}
            disabled={state === AppState.CONNECTING || state === AppState.LISTENING || state === AppState.SPEAKING}
            className={`flex flex-col items-center gap-1 transition-all ${
              state === AppState.STANDBY ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-400'
            } disabled:opacity-10`}
          >
            <div className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all ${
              state === AppState.STANDBY ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-slate-800 bg-slate-900/50'
            }`}>
              <i className="fas fa-bolt-lightning text-xs"></i>
            </div>
            <span className="text-[7px] font-black uppercase tracking-[0.2em]">STANDBY</span>
          </button>

          <div className="relative transform -translate-y-2">
            {state === AppState.IDLE || state === AppState.STANDBY || state === AppState.SLEEP || state === AppState.ERROR ? (
              <button
                onClick={() => startConversation()}
                className="group flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full transition-all active:scale-90 shadow-2xl shadow-blue-500/20"
              >
                <i className="fas fa-microphone text-2xl text-white"></i>
              </button>
            ) : (
              <button
                onClick={() => stopConversation()}
                className="group flex items-center justify-center w-16 h-16 bg-rose-600 rounded-full transition-all active:scale-90 shadow-2xl shadow-rose-500/20"
              >
                <i className="fas fa-stop text-xl text-white"></i>
              </button>
            )}
          </div>

          <button
            onClick={() => setTranscripts([])}
            className="flex flex-col items-center gap-1 text-slate-600 hover:text-slate-400"
          >
            <div className="w-11 h-11 rounded-full flex items-center justify-center border border-slate-800 bg-slate-900/50">
              <i className="fas fa-rotate-right text-xs"></i>
            </div>
            <span className="text-[7px] font-black uppercase tracking-[0.2em]">CLEAR</span>
          </button>
        </div>
      </main>

      {errorMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[85%] bg-rose-600/90 backdrop-blur-md p-3 rounded-2xl text-center shadow-2xl z-50">
          <p className="text-[9px] text-white font-black uppercase tracking-widest">{errorMessage}</p>
        </div>
      )}
    </div>
  );
};

export default App;
