import React from 'react';

const Avatar = ({ user, size = 40, showOnline = true }) => {
  const initials = user?.displayName
    ? user.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)
    : '??';

  const src = user?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName||'?')}&background=FF4D8D&color=fff&bold=true&size=200`;

  const dotSize = Math.max(10, size * 0.26);

  return (
    <div style={{ position:'relative', display:'inline-block', flexShrink:0 }}>
      <img
        src={src}
        alt={user?.displayName}
        style={{
          width: size, height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          border: '2px solid var(--border-strong)',
        }}
        onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${initials}&background=FF4D8D&color=fff`; }}
      />
      {showOnline && (
        <span
          className={user?.status?.isOnline ? 'online-pulse' : ''}
          style={{
            position: 'absolute',
            bottom: 1, right: 1,
            width: dotSize, height: dotSize,
            borderRadius: '50%',
            background: user?.status?.isOnline ? 'var(--accent-green)' : 'var(--text-muted)',
            border: '2px solid var(--bg-surface)',
            transition: 'background 300ms ease',
          }}
        />
      )}
    </div>
  );
};

export default Avatar;
