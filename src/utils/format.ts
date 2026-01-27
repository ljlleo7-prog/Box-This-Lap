export function formatTime(seconds: number): string {
  if (seconds === 0) return '-:--.---';
  
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function formatGap(seconds: number): string {
  if (seconds === 0) return 'LEADER';
  if (seconds < 0) return `+${Math.abs(seconds).toFixed(1)}`;
  return `+${seconds.toFixed(1)}`;
}
