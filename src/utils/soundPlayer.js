import { Howl } from 'howler';

const sounds = {
  message:  new Howl({ src: ['/sounds/message.mp3'],       volume: 0.5 }),
  ringtone: new Howl({ src: ['/sounds/call-ringtone.mp3'], volume: 0.8, loop: true }),
  callEnd:  new Howl({ src: ['/sounds/call-end.mp3'],      volume: 0.6 }),
};

let ringtoneId = null;

export const soundPlayer = {
  play: (name) => {
    try {
      if (name === 'ringtone') {
        ringtoneId = sounds.ringtone.play();
      } else {
        sounds[name]?.play();
      }
    } catch {}
  },
  stopRingtone: () => {
    try {
      if (ringtoneId !== null) {
        sounds.ringtone.stop(ringtoneId);
        ringtoneId = null;
      }
    } catch {}
  },
  stop: (name) => {
    try { sounds[name]?.stop(); } catch {}
  }
};
