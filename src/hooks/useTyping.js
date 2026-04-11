import { useCallback, useRef } from 'react';

export const useTyping = (emit, conversationId) => {
  const isTypingRef = useRef(false);
  const timerRef    = useRef(null);

  const onType = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      emit('typing:start', { conversationId });
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      emit('typing:stop', { conversationId });
    }, 2000);
  }, [emit, conversationId]);

  const onBlur = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      emit('typing:stop', { conversationId });
      clearTimeout(timerRef.current);
    }
  }, [emit, conversationId]);

  return { onType, onBlur };
};
