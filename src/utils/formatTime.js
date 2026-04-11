import { format, isToday, isYesterday, formatDistanceToNow, differenceInMinutes } from 'date-fns';

export const formatMessageTime = (date) => {
  const d = new Date(date);
  return format(d, 'HH:mm');
};

export const formatLastSeen = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const mins = differenceInMinutes(new Date(), d);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (isToday(d)) return `today at ${format(d, 'HH:mm')}`;
  if (isYesterday(d)) return `yesterday at ${format(d, 'HH:mm')}`;
  return format(d, 'dd MMM');
};

export const formatDateSeparator = (date) => {
  const d = new Date(date);
  if (isToday(d))     return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
};

export const formatConversationTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'dd/MM/yy');
};

export const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
