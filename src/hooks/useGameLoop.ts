import { useEffect, useRef } from 'react';
import { useRaceStore } from '../store/raceStore';

export const useGameLoop = () => {
  const tick = useRaceStore(state => state.tick);
  const isPlaying = useRaceStore(state => state.isPlaying);
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();

  const animate = (time: number) => {
    if (previousTimeRef.current !== undefined) {
      const deltaTime = (time - previousTimeRef.current) / 1000; // ms to seconds
      // Cap delta time to prevent large jumps if tab was inactive
      const cappedDelta = Math.min(deltaTime, 0.1);
      tick(cappedDelta);
    }
    previousTimeRef.current = time;
    
    if (isPlaying) {
        requestRef.current = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      previousTimeRef.current = undefined;
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isPlaying, tick]);
};
