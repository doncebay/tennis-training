// Tiny i18n: English by default, Spanish when the browser (or ?lang=es) asks for it.
// Shared by the game screen and the phone controller.

const DICT = {
  en: {
    title: 'Tennis Training',
    tagline: 'Your phone is the racket. First-person tennis, powered by the gyroscope.',

    // Menu
    'menu.ctrlWaiting': '📱 Waiting for phone',
    'menu.ctrlConnected': '📱 Racket connected',
    'menu.step1': 'Connect your racket',
    'menu.code': 'Code',
    'menu.qrAlt': 'QR code to connect your phone',
    'menu.statusWaiting': 'Waiting for the phone…',
    'menu.statusConnected': '<b>📱 Phone connected!</b><br>Calibrate, then <b>swing</b> to start.',
    'menu.stepsTitle': 'Step by step',
    'menu.steps':
      '<li>Put the phone on the <b>same Wi-Fi</b> and scan the QR code.</li>' +
      '<li>If you see a security warning, tap <b>Advanced → Proceed</b> (it is a local certificate).</li>' +
      '<li>Tap <b>Connect</b> and allow motion access.</li>' +
      '<li>Point the top of the phone at the screen and tap <b>Calibrate</b>.</li>' +
      '<li>Hold it like a racket handle and <b>swing</b>.</li>',
    'menu.step2': 'Set up the match',
    'menu.court': 'Court',
    'menu.racket': 'Racket',
    'menu.racketPreview': '3D racket preview',
    'menu.racketDrag': 'Drag the racket to spin it.',
    'menu.difficulty': 'Difficulty',
    'menu.games': 'Games to win',
    'menu.play': 'Play',
    'menu.orSwing': 'or <b>swing</b> your phone',
    'menu.howTitle': 'How to play',
    'menu.how':
      '<p>Your player runs to the ball automatically; you just swing. <b>Timing</b> sets the direction: ' +
      '<b>early</b> = cross-court, <b>late</b> = down the line. The faster the swing, the harder and deeper the shot.</p>' +
      '<p>Serve: one swing tosses the ball, another one hits it — ideally at the very top. On <b>clay</b> the ball ' +
      'bounces high and slow; on <b>grass</b> it skids, stays low and flies.</p>',
    'menu.keys':
      'No phone? Mouse + <b>click</b> or <b>Space</b> to hit (Shift = hard) · <b>F</b> fullscreen · <b>Esc</b> menu',
    'menu.language': 'Language',

    'surface.hard': 'Hard',
    'surface.clay': 'Clay',
    'surface.grass': 'Grass',
    'surfaceMeta.hard': 'Fast · medium bounce',
    'surfaceMeta.clay': 'Slow · high bounce',
    'surfaceMeta.grass': 'Very fast · low bounce',

    'racket.classic': 'Classic',
    'racket.pro': 'Pro',
    'racket.ocean': 'Ocean',
    'racket.neon': 'Neon',

    'diff.easy': 'Easy',
    'diff.normal': 'Normal',
    'diff.hard': 'Hard',

    // HUD
    'hud.you': 'YOU',
    'hud.cpu': 'CPU',
    'hud.mouseMode': '🖱️ Mouse mode',
    'hud.phoneMode': '📱 Phone connected',
    'hud.soundLocked': '🔇 Click to enable sound',
    'hud.fullscreen': 'Fullscreen (F)',
    'hud.ctrlConnected': '📱 Controller connected',
    'hud.ctrlLost': 'Controller disconnected',
    'hud.calibrated': 'Calibrated ✓',

    'over.win': 'You win! 🏆',
    'over.lose': 'CPU wins',
    'over.rematch': 'Rematch',
    'over.menu': 'Menu',
    'over.swingHint': 'You can also swing your phone for a rematch.',
    'stats.aces': 'aces',
    'stats.winners': 'winners',
    'stats.maxSpeed': 'km/h max',

    // Match
    'hint.calibrateToStart': 'Point at the screen, tap Calibrate and swing to start.',
    'hint.yourServe': 'Your serve. Swing to toss the ball, then swing again to hit it at the top.',
    'hint.secondServe': 'Second serve. Swing to toss, then swing again to hit it at the top.',
    'hint.cpuServe': 'CPU to serve. Get ready!',
    'hint.cpuSecondServe': 'CPU second serve…',
    'hint.hitNow': 'Now! Hit it when the ball is at the top.',
    'hint.tossAgain': 'Toss it again: swing to toss, swing to hit.',

    'fb.perfectServe': 'Perfect serve!',
    'fb.weakServe': 'Weak serve',
    'fb.tooEarly': 'Too early!',
    'fb.tooLate': 'Too late!',
    'fb.cantReach': "Can't reach it!",
    'fb.perfect': 'Perfect!',
    'fb.early': 'Early → cross-court',
    'fb.late': 'Late → down the line',

    'call.net': 'Net!',
    'call.fault': 'Fault!',
    'call.out': 'Out!',
    'call.ace': 'Ace!',
    'call.cpuAce': 'CPU ace',
    'call.winner': 'Winner!',
    'call.cpuPoint': 'CPU point',
    'call.let': 'Let',
    'call.replay': 'Replay the serve',
    'call.secondServe': 'Second serve',
    'call.doubleFault': 'Double fault',

    'score.youWinMatch': 'You win the match!',
    'score.cpuWinsMatch': 'CPU wins the match',
    'score.gameYou': 'Game, you · {g}',
    'score.gameCpu': 'Game, CPU · {g}',
    'score.deuce': 'Deuce',
    'score.advYou': 'Advantage, you',
    'score.advCpu': 'Advantage, CPU',
    'score.all': '{p}-all',

    // Phone controller
    'c.pageTitle': 'Racket · Tennis Training',
    'c.title': 'Your racket',
    'c.enterCode': 'Enter the code shown on the screen.',
    'c.right': 'Right-handed',
    'c.left': 'Left-handed',
    'c.connect': 'Connect',
    'c.motionNote': "You'll be asked for permission to use the phone's motion sensors (gyroscope).",
    'c.connecting': 'Connecting…',
    'c.connected': 'Connected',
    'c.waitingScreen': 'Waiting for the screen…',
    'c.screenGone': 'The screen disconnected',
    'c.reconnecting': 'Reconnecting…',
    'c.replaced': 'Another phone took control',
    'c.room': 'Room {code}',
    'c.hintCalibrate': 'Point the top of the phone at the screen and tap <b>Calibrate</b>.',
    'c.calibrate': '🎯 Calibrate',
    'c.tap': 'Hit (tap)',
    'c.settings': 'Settings',
    'c.hand': 'Hand',
    'c.sensitivity': 'Swing sensitivity',
    'c.low': 'Low',
    'c.medium': 'Medium',
    'c.high': 'High',
    'c.calibrated': 'Calibrated ✓ Hold the phone like a racket and swing.',
    'c.errCode': 'The code has 4 letters.',
    'c.errHttps': 'Open this page over https:// to use the gyroscope.',
    'c.errPermission': 'No motion permission. On iPhone: Settings → Safari → Motion & Orientation Access, then reload.',
    'c.errSensors': 'Could not enable the gyroscope.',
    'c.errNoRoom': 'Room {code} does not exist. Check the code on the screen.',
    'c.noGyro': 'No gyroscope data. Are you on a phone? You can use the "Hit" button.',
    'c.forehand': 'Forehand',
    'c.backhand': 'Backhand',
    'c.overWin': 'You won the match! 🏆 Swing for a rematch',
    'c.overLose': 'You lost. Swing for a rematch',
    'c.debug': 'max spin {w}°/s · tip [{v}]',
  },

  es: {
    title: 'Tenis Training',
    tagline: 'Tu celular es la raqueta. Primera persona, con el giroscopio.',

    'menu.ctrlWaiting': '📱 Esperando al celular',
    'menu.ctrlConnected': '📱 Raqueta conectada',
    'menu.step1': 'Conecta tu raqueta',
    'menu.code': 'Código',
    'menu.qrAlt': 'Código QR para conectar el celular',
    'menu.statusWaiting': 'Esperando al celular…',
    'menu.statusConnected': '<b>📱 ¡Celular conectado!</b><br>Calibra y luego haz un <b>swing</b> para empezar.',
    'menu.stepsTitle': 'Paso a paso',
    'menu.steps':
      '<li>Celular en la <b>misma Wi-Fi</b>; escanea el QR.</li>' +
      '<li>Si sale un aviso de seguridad: <b>Avanzado → Continuar</b> (certificado local).</li>' +
      '<li>Toca <b>Conectar</b> y acepta el permiso de movimiento.</li>' +
      '<li>Apunta la punta del celular a la pantalla y toca <b>Calibrar</b>.</li>' +
      '<li>Sostenlo como el mango de la raqueta y haz <b>swing</b>.</li>',
    'menu.step2': 'Prepara el partido',
    'menu.court': 'Cancha',
    'menu.racket': 'Raqueta',
    'menu.racketPreview': 'Vista 3D de la raqueta',
    'menu.racketDrag': 'Arrastra la raqueta para girarla.',
    'menu.difficulty': 'Dificultad',
    'menu.games': 'Juegos para ganar',
    'menu.play': 'Jugar',
    'menu.orSwing': 'o haz un <b>swing</b> con el celular',
    'menu.howTitle': '¿Cómo se juega?',
    'menu.how':
      '<p>Tu jugador corre solo hacia la pelota; tú sólo haces el swing. El <b>momento</b> del golpe decide la ' +
      'dirección: <b>pronto</b> = cruzado, <b>tarde</b> = paralelo. Cuanto más rápido el swing, más fuerte y profundo el golpe.</p>' +
      '<p>Saque: un swing lanza la pelota y otro la golpea, idealmente en lo más alto. En <b>arcilla</b> la pelota ' +
      'bota alto y llega lenta; en <b>césped</b> patina, bota bajo y va rápida.</p>',
    'menu.keys':
      'Sin celular: mouse + <b>clic</b> o <b>Espacio</b> para golpear (Shift = fuerte) · <b>F</b> pantalla completa · <b>Esc</b> menú',
    'menu.language': 'Idioma',

    'surface.hard': 'Dura',
    'surface.clay': 'Arcilla',
    'surface.grass': 'Césped',
    'surfaceMeta.hard': 'Rápida · bote medio',
    'surfaceMeta.clay': 'Lenta · bote alto',
    'surfaceMeta.grass': 'Muy rápida · bote bajo',

    'racket.classic': 'Clásica',
    'racket.pro': 'Pro',
    'racket.ocean': 'Océano',
    'racket.neon': 'Neón',

    'diff.easy': 'Fácil',
    'diff.normal': 'Normal',
    'diff.hard': 'Difícil',

    'hud.you': 'TÚ',
    'hud.cpu': 'CPU',
    'hud.mouseMode': '🖱️ Modo mouse',
    'hud.phoneMode': '📱 Celular conectado',
    'hud.soundLocked': '🔇 Clic para activar sonido',
    'hud.fullscreen': 'Pantalla completa (F)',
    'hud.ctrlConnected': '📱 Control conectado',
    'hud.ctrlLost': 'Control desconectado',
    'hud.calibrated': 'Calibrado ✓',

    'over.win': '¡Ganaste! 🏆',
    'over.lose': 'Ganó la CPU',
    'over.rematch': 'Revancha',
    'over.menu': 'Menú',
    'over.swingHint': 'También puedes hacer un swing con el celular para la revancha.',
    'stats.aces': 'aces',
    'stats.winners': 'winners',
    'stats.maxSpeed': 'km/h máx.',

    'hint.calibrateToStart': 'Apunta a la pantalla, toca Calibrar y haz un swing para empezar.',
    'hint.yourServe': 'Tu saque. Swing para lanzar la pelota y otro swing para golpearla arriba.',
    'hint.secondServe': 'Segundo saque. Swing para lanzar la pelota y otro swing para golpearla arriba.',
    'hint.cpuServe': 'Saca la CPU. ¡Prepárate!',
    'hint.cpuSecondServe': 'Segundo saque de la CPU…',
    'hint.hitNow': '¡Ahora! Golpea cuando la pelota esté arriba.',
    'hint.tossAgain': 'Lánzala otra vez: swing para lanzar, swing para golpear.',

    'fb.perfectServe': '¡Saque perfecto!',
    'fb.weakServe': 'Saque flojo',
    'fb.tooEarly': '¡Muy pronto!',
    'fb.tooLate': '¡Tarde!',
    'fb.cantReach': '¡No llegas!',
    'fb.perfect': '¡Perfecto!',
    'fb.early': 'Pronto → cruzado',
    'fb.late': 'Tarde → paralelo',

    'call.net': '¡Red!',
    'call.fault': '¡Falta!',
    'call.out': '¡Fuera!',
    'call.ace': '¡Ace!',
    'call.cpuAce': 'Ace de la CPU',
    'call.winner': '¡Winner!',
    'call.cpuPoint': 'Punto CPU',
    'call.let': 'Let',
    'call.replay': 'Se repite el saque',
    'call.secondServe': 'Segundo saque',
    'call.doubleFault': 'Doble falta',

    'score.youWinMatch': '¡Ganaste el partido!',
    'score.cpuWinsMatch': 'La CPU gana el partido',
    'score.gameYou': 'Juego para ti · {g}',
    'score.gameCpu': 'Juego CPU · {g}',
    'score.deuce': 'Iguales (deuce)',
    'score.advYou': 'Ventaja para ti',
    'score.advCpu': 'Ventaja CPU',
    'score.all': '{p} iguales',

    'c.pageTitle': 'Raqueta · Tenis Training',
    'c.title': 'Tu raqueta',
    'c.enterCode': 'Escribe el código que aparece en la pantalla.',
    'c.right': 'Diestro',
    'c.left': 'Zurdo',
    'c.connect': 'Conectar',
    'c.motionNote': 'Se pedirá permiso para usar el movimiento del celular (giroscopio).',
    'c.connecting': 'Conectando…',
    'c.connected': 'Conectado',
    'c.waitingScreen': 'Esperando la pantalla…',
    'c.screenGone': 'La pantalla se desconectó',
    'c.reconnecting': 'Reconectando…',
    'c.replaced': 'Otro celular tomó el control',
    'c.room': 'Sala {code}',
    'c.hintCalibrate': 'Apunta la parte de arriba del celular hacia la pantalla y toca <b>Calibrar</b>.',
    'c.calibrate': '🎯 Calibrar',
    'c.tap': 'Golpe (tocar)',
    'c.settings': 'Ajustes',
    'c.hand': 'Mano',
    'c.sensitivity': 'Sensibilidad del swing',
    'c.low': 'Baja',
    'c.medium': 'Media',
    'c.high': 'Alta',
    'c.calibrated': 'Calibrado ✓ Sostén el celular como una raqueta y haz swing.',
    'c.errCode': 'El código tiene 4 letras.',
    'c.errHttps': 'Abre esta página con https:// para poder usar el giroscopio.',
    'c.errPermission': 'Sin permiso de movimiento. En iPhone: Ajustes → Safari → Movimiento y orientación, y recarga.',
    'c.errSensors': 'No se pudo activar el giroscopio.',
    'c.errNoRoom': 'No existe la sala {code}. Revisa el código en la pantalla.',
    'c.noGyro': 'No llegan datos del giroscopio. ¿Estás en un celular? Puedes usar el botón "Golpe".',
    'c.forehand': 'Drive',
    'c.backhand': 'Revés',
    'c.overWin': '¡Ganaste el partido! 🏆 Swing para la revancha',
    'c.overLose': 'Perdiste. Swing para la revancha',
    'c.debug': 'giro máx {w}°/s · punta [{v}]',
  },
};

export const LANGS = Object.keys(DICT);

function detect() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem('tt-lang');
    if (LANGS.includes(saved)) return saved;
  } catch {
    // Storage blocked (private mode): fall back to the browser language.
  }
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS.includes(browser) ? browser : 'en';
}

export const lang = detect();

/** Translate `key`, replacing `{name}` placeholders with `params.name`. */
export function t(key, params = {}) {
  const text = DICT[lang][key] ?? DICT.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '');
}

/**
 * Fill static markup: `data-i18n` sets text, `data-i18n-html` sets markup from
 * the dictionary, and `data-i18n-attr="attr:key;attr2:key2"` sets attributes.
 */
export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  });
}

/** Switch language and reload (keeps other query params, e.g. the room code). */
export function setLang(next) {
  try {
    localStorage.setItem('tt-lang', next);
  } catch {
    // Without storage the ?lang= param below still does the job for this page.
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  location.replace(url);
}
