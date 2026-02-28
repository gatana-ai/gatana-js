/**
 * Format a date string into a kubectl-style age string.
 * e.g. "3s", "5m12s", "2h30m", "4d", "12d", "45d"
 */
export function formatAge(dateStr: any): string {
  if (!dateStr) return '<unknown>';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return '0s';

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Converts a kubectl-style age string back into milliseconds.
 * e.g. "3s" => 3000, "5m12s" => 312000, "2h30m" => 9000000, "4d" => 345600000, "45d" => 3888000000
 * @param ageStr The age string to convert. Example: 3m10s
 * @returns The age in milliseconds, or null if the input is invalid.
 */
export function fromAge(ageStr: string): number | null {
  const pattern = /(\d+)([smhd])/g;
  let match;
  let total = 0;
  let matched = false;

  while ((match = pattern.exec(ageStr)) !== null) {
    matched = true;
    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        total += value * 1000;
        break;
      case 'm':
        total += value * 1000 * 60;
        break;
      case 'h':
        total += value * 1000 * 60 * 60;
        break;
      case 'd':
        total += value * 1000 * 60 * 60 * 24;
        break;
    }
  }

  return matched ? total : null;
}
