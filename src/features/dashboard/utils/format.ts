/** Time-of-day greeting for the dashboard header. */
export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good evening';
}

/** Compact uptime label, e.g. "45s", "12m", "3h 4m", "2d 5h". */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (seconds < 86400) return `${hours}h ${mins}m`;
  const days = Math.floor(seconds / 86400);
  return `${days}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/** Compact number label, e.g. "999", "4.0K", "1.2M". */
export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
