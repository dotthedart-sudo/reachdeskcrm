/**
 * Table cell formatters for Due date, Last contacted, and Last activity.
 */

export function formatDueText(iso, nextStep) {
  if (!iso) {
    if (nextStep && nextStep !== 'None' && nextStep !== 'No action needed' && nextStep !== 'No call needed') {
      return { text: 'Set time', isPlaceholder: true, isOverdue: false };
    }
    return { text: '—', isPlaceholder: false, isOverdue: false };
  }

  const d = new Date(iso);
  if (isNaN(d.getTime())) return { text: '—', isPlaceholder: false, isOverdue: false };

  const now = new Date();
  const isOverdue = d.getTime() < now.getTime() - 60 * 1000; // past now by >1 min

  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (isOverdue) {
    const daysLate = Math.floor((now.getTime() - d.getTime()) / 86400000);
    return {
      text: daysLate < 1 ? 'Overdue' : `${daysLate}d overdue`,
      fullTime: `${dateStr}, ${timeStr}`,
      isOverdue: true,
      isPlaceholder: false,
    };
  }

  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const hasExplicitTime = d.getHours() !== 0 || d.getMinutes() !== 0;

  if (isToday) {
    return {
      text: hasExplicitTime ? `Today, ${timeStr}` : 'Today',
      isOverdue: false,
      isPlaceholder: false,
    };
  }

  if (isTomorrow) {
    return {
      text: hasExplicitTime ? `Tomorrow, ${timeStr}` : 'Tomorrow',
      isOverdue: false,
      isPlaceholder: false,
    };
  }

  return {
    text: hasExplicitTime ? `${dateStr}, ${timeStr}` : dateStr,
    isOverdue: false,
    isPlaceholder: false,
  };
}

export function formatLastActivityText(iso, typeLabel = 'Call') {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins >= 0 && diffMins < 60) {
    return `${Math.max(1, diffMins)}m ago · ${typeLabel}`;
  }
  if (diffHours >= 1 && diffHours < 24 && d.toDateString() === now.toDateString()) {
    return `${diffHours}h ago · ${typeLabel}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${dateStr}, ${timeStr} · ${typeLabel}`;
}

export function formatLastContactedText(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';

  const now = new Date();
  const mins = Math.round((now - d) / 60000);
  if (mins >= 0 && mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`;
  if (d.toDateString() === now.toDateString()) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const days = Math.floor((now - d) / 86400000);
  if (days >= 2 && days < 7) return `${days}d ago`;
  if (days >= 7 && days < 35) return `${Math.floor(days / 7)}w ago`;

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
