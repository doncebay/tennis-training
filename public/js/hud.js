// On-screen UI over the game (scoreboard, callouts, end-of-match screen).
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    games: [$('g-me'), $('g-cpu')],
    points: [$('p-me'), $('p-cpu')],
    serve: [$('s-me'), $('s-cpu')],
    diff: $('sb-diff'),
    toast: $('toast'),
    toastTitle: $('toast-title'),
    toastSub: $('toast-sub'),
    hint: $('hint'),
    feedback: $('feedback'),
    speed: $('speed'),
    over: $('over'),
  };
  let toastTimer = 0;
  let feedbackTimer = 0;
  let speedTimer = 0;

  return {
    score({ games, points, server, difficulty }) {
      for (let i = 0; i < 2; i++) {
        els.games[i].textContent = games[i];
        els.points[i].textContent = points[i];
      }
      els.serve[0].classList.toggle('on', server === 'player');
      els.serve[1].classList.toggle('on', server === 'ai');
      if (difficulty) els.diff.textContent = difficulty;
    },

    toast(title, sub = '', kind = '') {
      els.toastTitle.textContent = title;
      els.toastSub.textContent = sub;
      els.toast.className = `show ${kind}`;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (els.toast.className = ''), 1900);
    },

    hint(text) {
      els.hint.textContent = text;
      els.hint.classList.toggle('show', Boolean(text));
    },

    feedback(text, kind = '') {
      els.feedback.textContent = text;
      els.feedback.className = `show ${kind}`;
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => (els.feedback.className = ''), 900);
    },

    speed(kmh) {
      els.speed.textContent = `${kmh} km/h`;
      els.speed.classList.add('show');
      clearTimeout(speedTimer);
      speedTimer = setTimeout(() => els.speed.classList.remove('show'), 2500);
    },

    matchOver(won, games, stats) {
      $('over-title').textContent = t(won ? 'over.win' : 'over.lose');
      $('over-score').textContent = `${games[0]} – ${games[1]}`;
      $('over-stats').innerHTML =
        `<div><b>${stats.aces}</b><span>${t('stats.aces')}</span></div>` +
        `<div><b>${stats.winners}</b><span>${t('stats.winners')}</span></div>` +
        `<div><b>${stats.maxSpeed || 0}</b><span>${t('stats.maxSpeed')}</span></div>`;
      els.over.classList.add('show');
    },

    hideOver() {
      els.over.classList.remove('show');
    },
  };
}
