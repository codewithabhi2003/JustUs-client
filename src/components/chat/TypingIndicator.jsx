import React from 'react';

const TypingIndicator = ({ isTyping, displayName }) => {
  if (!isTyping) return null;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 20px 8px' }}>
      <div className="typing-bubble">
        <span /><span /><span />
      </div>
      <p style={{ fontSize:12, color:'var(--text-muted)' }}>
        {displayName} is typing…
      </p>
    </div>
  );
};

export default TypingIndicator;
