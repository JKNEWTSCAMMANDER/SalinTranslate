
import React, { useEffect, useState, useRef } from 'react';
import { AppState, Mood } from '../types';

interface OrbProps {
  state: AppState;
  mood: Mood;
}

const Orb: React.FC<OrbProps> = ({ state, mood }) => {
  const [tilt, setTilt] = useState(0);
  const [blink, setBlink] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (state === AppState.IDLE || state === AppState.STANDBY) {
      const scheduleNextBlink = () => {
        const nextBlinkIn = 2000 + Math.random() * 5000;
        idleTimerRef.current = window.setTimeout(() => {
          setBlink(true);
          setTimeout(() => setBlink(false), 150);
          scheduleNextBlink();
        }, nextBlinkIn);
      };

      const scheduleNextGaze = () => {
        const nextGazeIn = 3000 + Math.random() * 4000;
        setTimeout(() => {
          if (state === AppState.IDLE || state === AppState.STANDBY) {
            setGaze({
              x: (Math.random() - 0.5) * 6,
              y: (Math.random() - 0.5) * 3
            });
            scheduleNextGaze();
          }
        }, nextGazeIn);
      };

      scheduleNextBlink();
      scheduleNextGaze();
    } else {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      setBlink(false);
      setGaze({ x: 0, y: 0 });
    }

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [state]);

  useEffect(() => {
    let interval: any;
    if (state === AppState.LISTENING) {
      interval = setInterval(() => {
        setTilt(prev => (prev === 4 ? -4 : 4));
      }, 1500);
    } else {
      setTilt(0);
    }
    return () => clearInterval(interval);
  }, [state]);

  const getColors = () => {
    if (state === AppState.ERROR) return 'from-red-800 to-red-950 shadow-red-900/50';
    if (state === AppState.CONNECTING) return 'from-yellow-400 to-orange-500';
    if (state === AppState.SLEEP) return 'from-slate-800 to-slate-900';

    switch (mood) {
      case Mood.HAPPY:
        return 'from-amber-400 via-yellow-500 to-orange-500 shadow-yellow-500/60';
      case Mood.SAD:
        return 'from-blue-600 via-indigo-700 to-slate-800 shadow-blue-900/40';
      case Mood.SURPRISED:
        return 'from-cyan-400 via-blue-400 to-purple-500 shadow-cyan-400/60';
      case Mood.ANGRY:
        return 'from-rose-600 via-red-700 to-black shadow-rose-900/70';
      case Mood.THINKING:
        return 'from-purple-500 via-indigo-600 to-slate-900 shadow-purple-900/50';
      default:
        return state === AppState.LISTENING 
          ? 'from-cyan-400 via-blue-500 to-indigo-600 shadow-cyan-500/70'
          : 'from-indigo-600 to-purple-800 shadow-indigo-500/40';
    }
  };

  const renderFace = () => {
    const browClass = "transition-all duration-700 ease-in-out stroke-white fill-none stroke-[3] stroke-linecap-round";
    const eyeBaseClass = "transition-all duration-500 ease-in-out fill-white/20";
    const pupilClass = "transition-all duration-500 ease-in-out fill-white";
    const mouthClass = "transition-all duration-700 ease-in-out stroke-white fill-none stroke-[4] stroke-linecap-round";
    const blushClass = "transition-all duration-1000 ease-in-out fill-rose-400/30 blur-md";

    let browL = "M25 35 Q35 30 45 35";
    let browR = "M55 35 Q65 30 75 35";
    let mouthPath = "M40 75 Q50 80 60 75"; 
    let pupilSize = 4;
    let showBlush = false;

    // Mood-specific overrides
    switch (mood) {
      case Mood.HAPPY:
        browL = "M25 32 Q35 25 45 32";
        browR = "M55 32 Q65 25 75 32";
        mouthPath = "M30 72 Q50 90 70 72";
        pupilSize = 5;
        showBlush = true;
        break;
      case Mood.SAD:
        browL = "M25 35 Q35 40 45 38";
        browR = "M55 38 Q65 40 75 35";
        mouthPath = "M40 85 Q50 78 60 85";
        pupilSize = 3;
        break;
      case Mood.SURPRISED:
        browL = "M25 25 Q35 20 45 25";
        browR = "M55 25 Q65 20 75 25";
        mouthPath = "M42 80 A8 8 0 1 0 58 80 A8 8 0 1 0 42 80";
        pupilSize = 6;
        break;
      case Mood.ANGRY:
        browL = "M25 40 Q35 45 45 35";
        browR = "M55 35 Q65 45 75 40";
        mouthPath = "M35 85 Q50 75 65 85";
        pupilSize = 4;
        break;
      case Mood.THINKING:
        browL = "M25 30 Q35 28 45 30";
        browR = "M55 40 Q65 42 75 40";
        mouthPath = "M45 80 Q50 80 55 80";
        pupilSize = 4;
        break;
    }

    // State specific overrides
    if (state === AppState.SLEEP) {
      browL = "M25 40 Q35 42 45 40";
      browR = "M55 40 Q65 42 75 40";
      mouthPath = "M45 78 Q50 80 55 78";
      pupilSize = 0;
    } else if (state === AppState.LISTENING) {
      pupilSize = 5.5;
    }

    return (
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {showBlush && (
          <>
            <circle cx="25" cy="65" r="10" className={blushClass} />
            <circle cx="75" cy="65" r="10" className={blushClass} />
          </>
        )}
        
        <path d={browL} className={browClass} />
        <path d={browR} className={browClass} />
        
        <g transform={`translate(${gaze.x}, ${gaze.y})`}>
          <circle cx="35" cy="50" r="9" className={eyeBaseClass} />
          <circle cx="65" cy="50" r="9" className={eyeBaseClass} />
          {!blink && state !== AppState.SLEEP && (
            <>
              <circle cx="35" cy="50" r={pupilSize} className={pupilClass} />
              <circle cx="65" cy="50" r={pupilSize} className={pupilClass} />
            </>
          )}
        </g>
        
        <path d={mouthPath} className={mouthClass} />
      </svg>
    );
  };

  return (
    <div 
      className={`relative w-52 h-52 rounded-full bg-gradient-to-br ${getColors()} transition-all duration-1000 flex items-center justify-center overflow-hidden shadow-2xl z-10`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <div className={`absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="w-36 h-36">
        {renderFace()}
      </div>
    </div>
  );
};

export default Orb;
