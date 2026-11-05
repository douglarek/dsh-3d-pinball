window.__ModuleLoader__.load({
  id: '@douglarek/dsh-3d-pinball',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const PANEL_ID = 'pinball';
    const NS = 'plugin.pinball';

    /* #region game */
    const TAU = Math.PI * 2;
    const GAME = {
      width: 420,
      height: 700,
      ball: 9.5,
      gravity: 1450,
      maxSpeed: 2200,
      flipSpeed: 24,
      flipperLength: 56,
      flipperRadius: 7,
      laneX: 370,
      plungerY: 650,
      drainY: 664,
      chargeTime: 0.55,
      launchMin: 1010,
      launchMax: 1650,
    };

    const ARC = { cx: 193, cy: 270, r: 157 };
    const CHUTE = [
      [390, 662], [390, 200], [378, 152], [352, 110], [312, 80],
      [262, 62], [205, 58], [150, 72], [105, 98], [72, 136],
      [50, 182], [38, 228], [36, 270],
    ];
    const BUMPER_LAYOUT = [
      { x: 146, y: 305, r: 23 },
      { x: 234, y: 268, r: 23 },
      { x: 296, y: 340, r: 23 },
    ];
    const SLING_LAYOUT = [
      { ax: 78, ay: 428, bx: 150, by: 504, cx: 78, cy: 504 },
      { ax: 308, ay: 428, bx: 236, by: 504, cx: 308, cy: 504 },
    ];
    const TARGET_LAYOUT = [
      { x: 150, y: 392, w: 30, h: 11 },
      { x: 193, y: 392, w: 30, h: 11 },
      { x: 236, y: 392, w: 30, h: 11 },
    ];
    const FLIPPER_LAYOUT = [
      { px: 125, py: 590, rest: 0.593, up: -0.56 },
      { px: 261, py: 590, rest: Math.PI - 0.593, up: Math.PI + 0.56 },
    ];

    const STARS = (() => {
      let seed = 20240607;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      const out = [];
      for (let i = 0; i < 96; i += 1) {
        out.push({
          x: 18 + rand() * 384,
          y: 18 + rand() * 636,
          r: 0.4 + rand() * 1.5,
          a: 0.2 + rand() * 0.6,
          p: rand() * TAU,
          c: rand() > 0.72 ? '#9fd8ff' : '#ffffff',
        });
      }
      return out;
    })();

    let sessionBest = 0;

    function segment(ax, ay, bx, by, options) {
      const o = options || {};
      return {
        ax, ay, bx, by,
        restitution: o.restitution === undefined ? 0.45 : o.restitution,
        radius: o.radius || 0,
        kick: o.kick || 0,
        oneWay: !!o.oneWay,
      };
    }

    function closestOnSegment(px, py, ax, ay, bx, by) {
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      let t = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return { x: ax + dx * t, y: ay + dy * t };
    }

    function buildWalls() {
      const walls = [];
      const push = (ax, ay, bx, by, options) => walls.push(segment(ax, ay, bx, by, options));

      push(36, 270, 36, 520, { restitution: 0.52 });
      push(36, 520, 136, 560, { restitution: 0.5 });
      push(136, 560, 125, 590, { restitution: 0.42 });
      push(350, 662, 350, 270, { restitution: 0.52 });
      push(250, 560, 350, 520, { restitution: 0.5 });
      push(250, 560, 261, 590, { restitution: 0.42 });
      push(350, 662, 390, 662, { restitution: 0.15 });

      for (let i = 0; i < CHUTE.length - 1; i += 1) {
        push(CHUTE[i][0], CHUTE[i][1], CHUTE[i + 1][0], CHUTE[i + 1][1], { restitution: 0.58 });
      }

      push(350, 288, 390, 256, { restitution: 0.32, oneWay: true });

      for (const s of SLING_LAYOUT) {
        push(s.cx, s.cy, s.cx, s.ay, { restitution: 0.42 });
        push(s.cx, s.cy, s.bx, s.by, { restitution: 0.42 });
      }

      return walls;
    }

    function createGame() {
      const state = {
        phase: 'ready',
        resumePhase: 'playing',
        score: 0,
        best: sessionBest,
        ballNumber: 1,
        ballsLeft: 3,
        multiplier: 1,
        charge: 0,
        charging: false,
        targetsDown: 0,
        message: '',
        messageUntil: 0,
        time: 0,
      };

      const ball = {
        x: GAME.laneX,
        y: GAME.plungerY - GAME.ball,
        vx: 0,
        vy: 0,
        trail: [],
      };
      const plunger = { y: GAME.plungerY };
      const walls = buildWalls();
      const bumpers = BUMPER_LAYOUT.map((b, index) => ({
        x: b.x, y: b.y, r: b.r, index, flash: 0, cooldown: 0,
      }));
      const slings = SLING_LAYOUT.map((s) => ({
        ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, cx: s.cx, cy: s.cy, flash: 0,
      }));
      const targets = TARGET_LAYOUT.map((t) => ({
        x: t.x, y: t.y, w: t.w, h: t.h, down: false, flash: 0,
      }));
      const flippers = FLIPPER_LAYOUT.map((f) => ({
        px: f.px, py: f.py, rest: f.rest, up: f.up,
        angle: f.rest, omega: 0, pressed: false,
      }));
      const popups = [];
      const events = [];
      let targetReset = 0;
      let stuckTime = 0;
      let nudges = 0;

      function emit(kind, data) {
        events.push(data ? Object.assign({ kind }, data) : { kind });
      }

      function addScore(points) {
        state.score += Math.round(points);
        if (state.score > state.best) {
          state.best = state.score;
          sessionBest = state.score;
        }
      }

      function popup(x, y, text) {
        popups.push({ x, y, text, life: 0.95, maxLife: 0.95 });
      }

      function bounce(nx, ny, restitution, kick) {
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn >= 0) return;
        const tx = -ny;
        const ty = nx;
        const vt = ball.vx * tx + ball.vy * ty;
        const outVn = -vn * restitution + kick;
        const outVt = vt * 0.985;
        ball.vx = outVn * nx + outVt * tx;
        ball.vy = outVn * ny + outVt * ty;
      }

      function collideWall(w) {
        const point = closestOnSegment(ball.x, ball.y, w.ax, w.ay, w.bx, w.by);
        let dx = ball.x - point.x;
        let dy = ball.y - point.y;
        let d = Math.hypot(dx, dy);
        const limit = GAME.ball + w.radius;
        if (d >= limit) return;
        if (w.oneWay && ball.vy < 0) return;
        if (d < 0.0001) {
          dx = -(w.by - w.ay);
          dy = w.bx - w.ax;
          d = Math.hypot(dx, dy) || 1;
        }
        const nx = dx / d;
        const ny = dy / d;
        ball.x = point.x + nx * limit;
        ball.y = point.y + ny * limit;
        bounce(nx, ny, w.restitution, w.kick);
      }

      function collideBumper(b) {
        if (b.cooldown > 0) return;
        const dx = ball.x - b.x;
        const dy = ball.y - b.y;
        let d = Math.hypot(dx, dy);
        const limit = GAME.ball + b.r;
        if (d >= limit) return;
        if (d < 0.0001) d = 1;
        const nx = dx / d;
        const ny = dy / d;
        ball.x = b.x + nx * limit;
        ball.y = b.y + ny * limit;
        const vt = ball.vx * -ny + ball.vy * nx;
        const speed = 560;
        ball.vx = nx * speed + -ny * vt * 0.4;
        ball.vy = ny * speed + nx * vt * 0.4;
        b.flash = 1;
        b.cooldown = 0.12;
        const points = 1000 * state.multiplier;
        addScore(points);
        popup(b.x, b.y - b.r - 4, '+' + points);
        emit('bumper');
      }

      function collideSling(s) {
        const point = closestOnSegment(ball.x, ball.y, s.ax, s.ay, s.bx, s.by);
        let dx = ball.x - point.x;
        let dy = ball.y - point.y;
        let d = Math.hypot(dx, dy);
        if (d >= GAME.ball || d < 0.0001) return;
        const nx = dx / d;
        const ny = dy / d;
        ball.x = point.x + nx * GAME.ball;
        ball.y = point.y + ny * GAME.ball;
        bounce(nx, ny, 0.5, 400);
        if (s.flash <= 0) {
          const points = 500 * state.multiplier;
          addScore(points);
          popup(point.x, point.y - 8, '+' + points);
          emit('sling');
        }
        s.flash = 1;
      }

      function collideTarget(t) {
        if (t.down) return;
        const left = t.x - t.w / 2;
        const right = t.x + t.w / 2;
        const top = t.y - t.h / 2;
        const bottom = t.y + t.h / 2;
        const cx = Math.max(left, Math.min(ball.x, right));
        const cy = Math.max(top, Math.min(ball.y, bottom));
        const dx = ball.x - cx;
        const dy = ball.y - cy;
        const d = Math.hypot(dx, dy);
        if (d >= GAME.ball) return;
        if (d < 0.0001) {
          ball.y = top - GAME.ball;
          bounce(0, -1, 0.35, 0);
        } else {
          const nx = dx / d;
          const ny = dy / d;
          ball.x = cx + nx * GAME.ball;
          ball.y = cy + ny * GAME.ball;
          bounce(nx, ny, 0.35, 0);
        }
        t.down = true;
        t.flash = 1;
        state.targetsDown += 1;
        const points = 2500 * state.multiplier;
        addScore(points);
        popup(t.x, t.y - 14, '+' + points);
        emit('target');
        if (state.targetsDown >= targets.length) {
          state.multiplier = Math.min(5, state.multiplier + 1);
          addScore(12000);
          state.message = 'multiplier';
          state.messageUntil = state.time + 2.2;
          targetReset = 1.5;
          emit('jackpot');
        }
      }

      function collideFlipper(f) {
        const tipX = f.px + Math.cos(f.angle) * GAME.flipperLength;
        const tipY = f.py + Math.sin(f.angle) * GAME.flipperLength;
        const point = closestOnSegment(ball.x, ball.y, f.px, f.py, tipX, tipY);
        let dx = ball.x - point.x;
        let dy = ball.y - point.y;
        let d = Math.hypot(dx, dy);
        const limit = GAME.ball + GAME.flipperRadius;
        if (d >= limit) return;
        if (d < 0.0001) {
          dx = 0;
          dy = -1;
          d = 1;
        }
        const nx = dx / d;
        const ny = dy / d;
        ball.x = point.x + nx * limit;
        ball.y = point.y + ny * limit;
        const rx = point.x - f.px;
        const ry = point.y - f.py;
        const cvx = -f.omega * ry;
        const cvy = f.omega * rx;
        const rvx = ball.vx - cvx;
        const rvy = ball.vy - cvy;
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0) return;
        const tx = -ny;
        const ty = nx;
        const vt = rvx * tx + rvy * ty;
        const outVn = -vn * (f.pressed ? 0.55 : 0.32);
        const outVt = vt * 0.94;
        ball.vx = outVn * nx + outVt * tx + cvx;
        ball.vy = outVn * ny + outVt * ty + cvy;
      }

      function simulate(step) {
        ball.vy += GAME.gravity * step;
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > GAME.maxSpeed) {
          const k = GAME.maxSpeed / speed;
          ball.vx *= k;
          ball.vy *= k;
        }
        ball.x += ball.vx * step;
        ball.y += ball.vy * step;
        for (let pass = 0; pass < 2; pass += 1) {
          for (const w of walls) collideWall(w);
          for (const f of flippers) collideFlipper(f);
          for (const s of slings) collideSling(s);
          for (const b of bumpers) collideBumper(b);
          for (const t of targets) collideTarget(t);
        }
        if (
          ball.x < -40 || ball.x > GAME.width + 40
          || ball.y < -80 || ball.y > GAME.height + 40
        ) {
          placeBall();
        }
      }

      function placeBall() {
        state.phase = 'ready';
        state.charge = 0;
        state.charging = false;
        plunger.y = GAME.plungerY;
        ball.x = GAME.laneX;
        ball.y = GAME.plungerY - GAME.ball;
        ball.vx = 0;
        ball.vy = 0;
        ball.trail.length = 0;
        stuckTime = 0;
      }

      function launch() {
        if (state.phase !== 'ready') return;
        const power = GAME.launchMin + state.charge * (GAME.launchMax - GAME.launchMin);
        state.phase = 'playing';
        state.charge = 0;
        state.charging = false;
        plunger.y = GAME.plungerY;
        ball.x = GAME.laneX;
        ball.y = GAME.plungerY - GAME.ball;
        ball.vx = 0;
        ball.vy = -power;
        stuckTime = 0;
        emit('launch');
      }

      function drain() {
        emit('drain');
        state.ballsLeft -= 1;
        if (state.ballsLeft <= 0) {
          state.phase = 'over';
          state.ballsLeft = 0;
          sessionBest = Math.max(sessionBest, state.score);
          state.best = sessionBest;
          emit('over');
          return;
        }
        state.ballNumber = 4 - state.ballsLeft;
        targets.forEach((t) => { t.down = false; t.flash = 0; });
        state.targetsDown = 0;
        targetReset = 0;
        placeBall();
      }

      function newGame() {
        state.score = 0;
        state.ballsLeft = 3;
        state.ballNumber = 1;
        state.multiplier = 1;
        state.targetsDown = 0;
        state.message = '';
        state.messageUntil = 0;
        state.phase = 'ready';
        state.resumePhase = 'playing';
        targets.forEach((t) => { t.down = false; t.flash = 0; });
        targetReset = 0;
        flippers.forEach((f) => { f.pressed = false; f.angle = f.rest; f.omega = 0; });
        popups.length = 0;
        placeBall();
      }

      function togglePause() {
        if (state.phase === 'paused') {
          state.phase = state.resumePhase;
          return;
        }
        if (state.phase === 'ready' || state.phase === 'playing') {
          state.resumePhase = state.phase;
          state.phase = 'paused';
        }
      }

      function press(key) {
        if (key === 'left') {
          const f = flippers[0];
          if (!f.pressed && state.phase !== 'paused' && state.phase !== 'over') emit('flip');
          f.pressed = true;
          return;
        }
        if (key === 'right') {
          const f = flippers[1];
          if (!f.pressed && state.phase !== 'paused' && state.phase !== 'over') emit('flip');
          f.pressed = true;
          return;
        }
        if (key === 'space') {
          if (state.phase === 'ready' && !state.charging) {
            state.charging = true;
            emit('charge');
          }
          return;
        }
        if (key === 'enter' && state.phase === 'over') newGame();
      }

      function release(key) {
        if (key === 'left') flippers[0].pressed = false;
        if (key === 'right') flippers[1].pressed = false;
        if (key === 'space') {
          if (state.phase === 'ready' && state.charging) launch();
          state.charging = false;
        }
      }

      function nudge(power) {
        const angle = -0.3 - Math.random() * 2.5;
        ball.vx += Math.cos(angle) * power;
        ball.vy += Math.sin(angle) * power;
      }

      function updateTimers(dt) {
        for (const b of bumpers) {
          if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 2.6);
          if (b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - dt);
        }
        for (const s of slings) if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 3.4);
        for (const t of targets) if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 2.2);
        for (let i = popups.length - 1; i >= 0; i -= 1) {
          popups[i].life -= dt;
          popups[i].y -= dt * 26;
          if (popups[i].life <= 0) popups.splice(i, 1);
        }
        if (targetReset > 0) {
          targetReset -= dt;
          if (targetReset <= 0) {
            targets.forEach((t) => { t.down = false; });
            state.targetsDown = 0;
          }
        }
      }

      function step(dt) {
        const delta = Math.min(Math.max(dt, 0), 0.05);
        state.time += delta;
        updateTimers(delta);
        if (state.phase === 'paused' || state.phase === 'over') return;

        for (const f of flippers) {
          const target = f.pressed ? f.up : f.rest;
          const diff = target - f.angle;
          const maxStep = GAME.flipSpeed * delta;
          const move = diff > maxStep ? maxStep : diff < -maxStep ? -maxStep : diff;
          f.angle += move;
          f.omega = delta > 0 ? move / delta : 0;
        }

        if (state.phase === 'ready') {
          if (state.charging) {
            state.charge = Math.min(1, state.charge + delta / GAME.chargeTime);
          }
          plunger.y = GAME.plungerY + state.charge * 26;
          ball.x = GAME.laneX;
          ball.y = plunger.y - GAME.ball;
          ball.vx = 0;
          ball.vy = 0;
          ball.trail.length = 0;
          return;
        }

        const speed = Math.hypot(ball.vx, ball.vy);
        const substeps = Math.max(1, Math.min(14, Math.ceil((speed * delta) / (GAME.ball * 0.75))));
        const sub = delta / substeps;
        for (let i = 0; i < substeps; i += 1) simulate(sub);

        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 11) ball.trail.shift();

        if (ball.y > GAME.drainY) {
          drain();
          return;
        }

        if (ball.x > 352 && ball.y > 560 && Math.abs(ball.vx) < 70 && Math.abs(ball.vy) < 90) {
          placeBall();
          return;
        }

        if (speed < 26) {
          stuckTime += delta;
          if (stuckTime > 2.2) {
            stuckTime = 0;
            nudges += 1;
            if (nudges > 2) {
              nudges = 0;
              placeBall();
              return;
            }
            nudge(260);
          }
        } else {
          stuckTime = 0;
          nudges = 0;
        }
      }

      function hud() {
        return {
          score: state.score,
          best: Math.max(state.best, state.score),
          ballNumber: state.ballNumber,
          ballsLeft: state.ballsLeft,
          multiplier: state.multiplier,
          phase: state.phase,
          charge: state.charge,
        };
      }

      function takeEvents() {
        if (events.length === 0) return events;
        return events.splice(0, events.length);
      }

      return {
        state, ball, plunger, flippers, bumpers, slings, targets, popups,
        step, press, release, newGame, togglePause, launch, hud, takeEvents,
      };
    }
    /* #endregion game */

    /* #region audio */
    function createSound() {
      let context = null;
      let enabled = true;

      function ensure() {
        if (context) {
          if (context.state === 'suspended') context.resume().catch(() => {});
          return context;
        }
        try {
          const Ctor = window.AudioContext || window.webkitAudioContext;
          if (!Ctor) return null;
          context = new Ctor();
          return context;
        } catch (error) {
          context = null;
          return null;
        }
      }

      function tone(freq, endFreq, duration, type, volume, delay) {
        const audio = ensure();
        if (!audio) return;
        const start = audio.currentTime + (delay || 0);
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (endFreq && endFreq !== freq) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      }

      function play(kind) {
        if (!enabled) return;
        if (!ensure()) return;
        switch (kind) {
          case 'flip':
            tone(210, 130, 0.06, 'square', 0.05);
            break;
          case 'charge':
            tone(150, 260, 0.12, 'sine', 0.04);
            break;
          case 'bumper':
            tone(760, 520, 0.1, 'triangle', 0.09);
            tone(1180, 900, 0.07, 'sine', 0.05, 0.01);
            break;
          case 'sling':
            tone(430, 300, 0.08, 'sawtooth', 0.05);
            break;
          case 'target':
            tone(980, 1420, 0.12, 'sine', 0.07);
            break;
          case 'launch':
            tone(120, 420, 0.26, 'sawtooth', 0.07);
            break;
          case 'drain':
            tone(320, 70, 0.55, 'sine', 0.09);
            break;
          case 'jackpot':
            tone(523, 523, 0.1, 'triangle', 0.08, 0);
            tone(659, 659, 0.1, 'triangle', 0.08, 0.09);
            tone(784, 784, 0.12, 'triangle', 0.08, 0.18);
            tone(1046, 1046, 0.22, 'triangle', 0.09, 0.28);
            break;
          case 'over':
            tone(392, 196, 0.5, 'triangle', 0.09, 0);
            tone(262, 130, 0.7, 'triangle', 0.08, 0.22);
            break;
          default:
            break;
        }
      }

      return {
        unlock() { ensure(); },
        setEnabled(value) { enabled = value; },
        play,
      };
    }
    /* #endregion audio */

    /* #region render */
    const COLORS = {
      goldDeep: '#b57d17',
      ballSteel: '#c8d4e6',
      bumper: [
        { inner: '#7fe0ff', outer: '#0b4a72', edge: 'rgba(140, 230, 255, 0.9)', cap: '#d8f4ff' },
        { inner: '#ff8de0', outer: '#6f1060', edge: 'rgba(255, 150, 226, 0.9)', cap: '#ffd9f2' },
        { inner: '#b9a0ff', outer: '#2a1a72', edge: 'rgba(190, 170, 255, 0.9)', cap: '#e8e0ff' },
      ],
    };

    function roundedRect(g, x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + radius, y);
      g.lineTo(x + w - radius, y);
      g.arcTo(x + w, y, x + w, y + radius, radius);
      g.lineTo(x + w, y + h - radius);
      g.arcTo(x + w, y + h, x + w - radius, y + h, radius);
      g.lineTo(x + radius, y + h);
      g.arcTo(x, y + h, x, y + h - radius, radius);
      g.lineTo(x, y + radius);
      g.arcTo(x, y, x + radius, y, radius);
      g.closePath();
    }

    function tracePlayfield(g) {
      g.beginPath();
      g.moveTo(36, 270);
      g.lineTo(36, 520);
      g.lineTo(136, 560);
      g.lineTo(125, 590);
      g.lineTo(171, 640);
      g.lineTo(215, 640);
      g.lineTo(261, 590);
      g.lineTo(250, 560);
      g.lineTo(350, 520);
      g.lineTo(350, 662);
      g.lineTo(390, 662);
      g.lineTo(390, 200);
      for (let i = 2; i < CHUTE.length; i += 1) g.lineTo(CHUTE[i][0], CHUTE[i][1]);
      g.closePath();
    }

    function traceRails(g) {
      g.beginPath();
      g.moveTo(36, 270);
      g.lineTo(36, 520);
      g.lineTo(136, 560);
      g.lineTo(125, 590);

      g.moveTo(261, 590);
      g.lineTo(250, 560);
      g.lineTo(350, 520);

      g.moveTo(350, 270);
      g.lineTo(350, 662);
      g.lineTo(390, 662);
      g.lineTo(390, 200);
      for (let i = 2; i < CHUTE.length; i += 1) g.lineTo(CHUTE[i][0], CHUTE[i][1]);
    }

    function drawSurface(g, time) {
      g.save();
      g.shadowColor = 'rgba(84, 176, 255, 0.5)';
      g.shadowBlur = 22;
      g.fillStyle = '#080d1f';
      tracePlayfield(g);
      g.fill();
      g.restore();

      const field = g.createLinearGradient(0, 50, 0, 660);
      field.addColorStop(0, '#152454');
      field.addColorStop(0.42, '#0b1332');
      field.addColorStop(1, '#05070f');
      g.fillStyle = field;
      tracePlayfield(g);
      g.fill();

      g.save();
      tracePlayfield(g);
      g.clip();

      for (const star of STARS) {
        const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.7 + star.p));
        g.globalAlpha = star.a * twinkle;
        g.fillStyle = star.c;
        g.beginPath();
        g.arc(star.x, star.y, star.r, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      g.strokeStyle = 'rgba(106, 150, 255, 0.09)';
      g.lineWidth = 1;
      for (let r = 60; r < 320; r += 42) {
        g.beginPath();
        g.arc(ARC.cx, 300, r, 0, TAU);
        g.stroke();
      }

      g.strokeStyle = 'rgba(120, 200, 255, 0.06)';
      for (let x = 60; x < 360; x += 40) {
        g.beginPath();
        g.moveTo(x, 120);
        g.lineTo(x, 640);
        g.stroke();
      }

      const laneGradient = g.createLinearGradient(350, 0, 390, 0);
      laneGradient.addColorStop(0, 'rgba(6, 10, 22, 0.9)');
      laneGradient.addColorStop(0.5, 'rgba(28, 46, 92, 0.5)');
      laneGradient.addColorStop(1, 'rgba(6, 10, 22, 0.9)');
      g.fillStyle = laneGradient;
      g.fillRect(350, 200, 40, 462);

      g.fillStyle = 'rgba(180, 224, 255, 0.11)';
      g.font = '600 15px "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('SPACE CADET', ARC.cx, 196);
      g.font = '500 9px "Helvetica Neue", Arial, sans-serif';
      g.fillText('FULL TILT', ARC.cx, 210);

      g.restore();

      g.save();
      g.lineWidth = 2.4;
      g.strokeStyle = 'rgba(122, 216, 255, 0.85)';
      g.shadowColor = 'rgba(96, 196, 255, 0.9)';
      g.shadowBlur = 14;
      traceRails(g);
      g.stroke();
      g.restore();

      g.save();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(154, 123, 255, 0.5)';
      g.setLineDash([5, 6]);
      g.beginPath();
      g.moveTo(350, 288);
      g.lineTo(390, 256);
      g.stroke();
      g.restore();
    }

    function drawPlunger(g, game) {
      const top = game.plunger.y;
      const bottom = 676;
      g.save();
      const body = g.createLinearGradient(354, 0, 386, 0);
      body.addColorStop(0, '#121c36');
      body.addColorStop(0.5, '#2a3d68');
      body.addColorStop(1, '#121c36');
      roundedRect(g, 354, top, 32, bottom - top, 5);
      g.fillStyle = body;
      g.fill();
      g.strokeStyle = 'rgba(130, 200, 255, 0.55)';
      g.lineWidth = 1.2;
      g.stroke();

      g.strokeStyle = 'rgba(160, 200, 255, 0.35)';
      g.lineWidth = 1.4;
      const span = Math.max(10, bottom - top - 12);
      const coils = Math.max(3, Math.round(span / 9));
      g.beginPath();
      for (let i = 0; i <= coils; i += 1) {
        const y = top + 8 + (span * i) / coils;
        g.moveTo(358, y);
        g.lineTo(382, y + span / coils / 2);
      }
      g.stroke();

      const charge = game.state.charge;
      const meterX = 398;
      const meterTop = 470;
      const meterHeight = 170;
      const segments = 10;
      for (let i = 0; i < segments; i += 1) {
        const filled = charge * segments > i;
        const y = meterTop + meterHeight - ((i + 1) * meterHeight) / segments + 2;
        roundedRect(g, meterX, y, 10, meterHeight / segments - 5, 3);
        g.fillStyle = filled
          ? (i > 7 ? '#ff6b6b' : i > 4 ? '#ffcf5c' : '#57d9ff')
          : 'rgba(120, 170, 230, 0.13)';
        g.fill();
      }
      if (game.state.phase === 'ready') {
        g.fillStyle = 'rgba(180, 224, 255, 0.55)';
        g.font = '600 8px "Helvetica Neue", Arial, sans-serif';
        g.textAlign = 'center';
        const label = game.state.charging ? 'POWER' : 'LAUNCH';
        for (let i = 0; i < label.length; i += 1) {
          g.fillText(label.charAt(i), meterX + 5, 462 + i * 9);
        }
      }
      g.restore();
    }

    function drawSlings(g, game) {
      for (const s of game.slings) {
        g.save();
        const body = g.createLinearGradient(s.cx, s.ay, s.bx, s.by);
        body.addColorStop(0, 'rgba(64, 92, 168, 0.9)');
        body.addColorStop(1, 'rgba(20, 30, 66, 0.95)');
        g.beginPath();
        g.moveTo(s.ax, s.ay);
        g.lineTo(s.bx, s.by);
        g.lineTo(s.cx, s.cy);
        g.closePath();
        g.fillStyle = body;
        g.fill();
        g.strokeStyle = 'rgba(120, 180, 255, 0.35)';
        g.lineWidth = 1.2;
        g.stroke();

        const glow = 0.35 + s.flash * 0.65;
        g.strokeStyle = 'rgba(255, 214, 110, ' + glow.toFixed(3) + ')';
        g.lineWidth = 3.4;
        g.lineCap = 'round';
        g.shadowColor = 'rgba(255, 200, 90, 0.8)';
        g.shadowBlur = 8 + s.flash * 12;
        g.beginPath();
        g.moveTo(s.ax, s.ay);
        g.lineTo(s.bx, s.by);
        g.stroke();
        g.restore();
      }
    }

    function drawTargets(g, game) {
      for (const t of game.targets) {
        g.save();
        const x = t.x - t.w / 2;
        const y = t.y - t.h / 2;
        roundedRect(g, x, y, t.w, t.h, 4);
        if (t.down) {
          g.strokeStyle = 'rgba(120, 170, 230, 0.22)';
          g.lineWidth = 1;
          g.stroke();
        } else {
          const face = g.createLinearGradient(x, y, x, y + t.h);
          face.addColorStop(0, t.flash > 0 ? '#fff6d0' : '#ffe08a');
          face.addColorStop(1, t.flash > 0 ? '#ffcf5c' : COLORS.goldDeep);
          g.shadowColor = 'rgba(255, 200, 90, 0.55)';
          g.shadowBlur = 6 + t.flash * 10;
          g.fillStyle = face;
          g.fill();
          g.shadowBlur = 0;
          g.strokeStyle = 'rgba(255, 236, 180, 0.8)';
          g.lineWidth = 1;
          g.stroke();
        }
        g.restore();
      }
    }

    function drawBumpers(g, game) {
      for (const b of game.bumpers) {
        const palette = COLORS.bumper[b.index % COLORS.bumper.length];
        g.save();
        g.translate(b.x, b.y);
        g.beginPath();
        g.arc(0, 0, b.r + 4, 0, TAU);
        g.fillStyle = 'rgba(7, 12, 28, 0.92)';
        g.fill();
        g.lineWidth = 1.6;
        g.strokeStyle = palette.edge;
        g.stroke();

        const face = g.createRadialGradient(-b.r * 0.35, -b.r * 0.45, 2, 0, 0, b.r);
        face.addColorStop(0, b.flash > 0 ? '#ffffff' : palette.inner);
        face.addColorStop(0.55, b.flash > 0 ? '#ffffff' : palette.outer);
        face.addColorStop(1, '#070c1c');
        g.beginPath();
        g.arc(0, 0, b.r - 2, 0, TAU);
        g.fillStyle = face;
        g.fill();

        g.beginPath();
        g.arc(0, 0, b.r * 0.42, 0, TAU);
        g.fillStyle = palette.cap;
        g.globalAlpha = 0.85;
        g.fill();
        g.globalAlpha = 1;

        if (b.flash > 0) {
          g.beginPath();
          g.arc(0, 0, b.r + 3 + b.flash * 9, 0, TAU);
          g.strokeStyle = 'rgba(255, 255, 255, ' + b.flash.toFixed(3) + ')';
          g.lineWidth = 2;
          g.stroke();
        }
        g.restore();
      }
    }

    function drawFlippers(g, game) {
      for (const f of game.flippers) {
        const tipX = f.px + Math.cos(f.angle) * GAME.flipperLength;
        const tipY = f.py + Math.sin(f.angle) * GAME.flipperLength;
        g.save();
        g.lineCap = 'round';
        const body = g.createLinearGradient(f.px, f.py, tipX, tipY);
        body.addColorStop(0, '#f2f6ff');
        body.addColorStop(0.35, '#c3d1e8');
        body.addColorStop(1, '#7f8fb0');
        g.strokeStyle = body;
        g.lineWidth = GAME.flipperRadius * 2;
        g.shadowColor = 'rgba(140, 200, 255, 0.55)';
        g.shadowBlur = 10;
        g.beginPath();
        g.moveTo(f.px, f.py);
        g.lineTo(tipX, tipY);
        g.stroke();

        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(f.px, f.py);
        g.lineTo(tipX, tipY);
        g.stroke();

        g.beginPath();
        g.arc(f.px, f.py, GAME.flipperRadius * 0.92, 0, TAU);
        g.fillStyle = '#1b2540';
        g.fill();
        g.strokeStyle = 'rgba(140, 200, 255, 0.6)';
        g.lineWidth = 1.4;
        g.stroke();
        g.restore();
      }
    }

    function drawBall(g, game) {
      const ball = game.ball;
      g.save();
      for (let i = 0; i < ball.trail.length; i += 1) {
        const t = ball.trail[i];
        const alpha = (i / ball.trail.length) * 0.22;
        g.globalAlpha = alpha;
        g.fillStyle = '#9fd2ff';
        g.beginPath();
        g.arc(t.x, t.y, GAME.ball * (0.45 + (i / ball.trail.length) * 0.5), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      g.shadowColor = 'rgba(0, 0, 0, 0.55)';
      g.shadowBlur = 8;
      g.shadowOffsetY = 3;
      const sphere = g.createRadialGradient(
        ball.x - GAME.ball * 0.35, ball.y - GAME.ball * 0.45, 1,
        ball.x, ball.y, GAME.ball,
      );
      sphere.addColorStop(0, '#ffffff');
      sphere.addColorStop(0.45, COLORS.ballSteel);
      sphere.addColorStop(1, '#5f6d88');
      g.fillStyle = sphere;
      g.beginPath();
      g.arc(ball.x, ball.y, GAME.ball, 0, TAU);
      g.fill();
      g.shadowBlur = 0;
      g.shadowOffsetY = 0;
      g.strokeStyle = 'rgba(10, 16, 32, 0.35)';
      g.lineWidth = 0.8;
      g.stroke();
      g.restore();
    }

    function drawPopups(g, game) {
      g.save();
      g.textAlign = 'center';
      g.font = '600 13px "Helvetica Neue", Arial, sans-serif';
      for (const p of game.popups) {
        const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
        g.globalAlpha = alpha;
        g.fillStyle = '#ffe9a8';
        g.shadowColor = 'rgba(255, 200, 90, 0.75)';
        g.shadowBlur = 8;
        g.fillText(p.text, p.x, p.y);
      }
      g.restore();
    }

    function drawMessage(g, game, time) {
      const state = game.state;
      if (state.message && state.time < state.messageUntil) {
        const left = state.messageUntil - state.time;
        const alpha = Math.min(1, left / 0.4);
        g.save();
        g.globalAlpha = alpha;
        g.textAlign = 'center';
        g.fillStyle = '#ffe9a8';
        g.shadowColor = 'rgba(255, 190, 80, 0.9)';
        g.shadowBlur = 16;
        g.font = '700 22px "Helvetica Neue", Arial, sans-serif';
        g.fillText('MULTIPLIER  x' + state.multiplier, ARC.cx, 448);
        g.restore();
      }
    }

    function drawScene(g, game, width, height, time) {
      const scale = Math.min(width / GAME.width, height / GAME.height);
      const offsetX = (width - GAME.width * scale) / 2;
      const offsetY = (height - GAME.height * scale) / 2;
      g.save();
      g.translate(offsetX, offsetY);
      g.scale(scale, scale);
      drawSurface(g, time);
      drawPlunger(g, game);
      drawTargets(g, game);
      drawSlings(g, game);
      drawBumpers(g, game);
      drawFlippers(g, game);
      drawBall(g, game);
      drawPopups(g, game);
      drawMessage(g, game, time);
      g.restore();
    }
    /* #endregion render */

    /* #region styles */
    const CSS = [
      '.pb-root{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111);font-size:14px;line-height:1.5;overflow:hidden}',
      '.pb-head{position:relative;flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:10px 18px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(120,140,170,.2))}',
      "[data-platform='darwin'] .pb-head{padding-top:calc(10px + var(--dsh-frame-top-clearance,0px));padding-left:calc(18px + var(--dsh-frame-leading-clearance,0px))}",
      '.pb-identity{display:flex;align-items:center;gap:10px;min-width:0;flex:0 1 auto}',
      '.pb-mark{width:34px;height:34px;flex:none;border-radius:10px;display:grid;place-items:center;background:linear-gradient(140deg,#1b2a6b,#0b1330);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1,rgba(120,140,170,.25)),0 0 16px rgba(87,217,255,.18)}',
      '.pb-title{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pb-subtitle{margin:0;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.pb-hud{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:1 1 auto;justify-content:center;min-width:0}',
      '.pb-stat{min-width:72px;padding:4px 10px 5px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#f4f5f7);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1,rgba(120,140,170,.2));display:flex;flex-direction:column;gap:1px}',
      '.pb-stat-label{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.pb-stat-value{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.pb-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}',
      '.pb-btn{height:30px;padding:0 12px;border-radius:15px;border:1px solid var(--dsw-alias-border-l1,rgba(120,140,170,.3));background:transparent;color:var(--dsw-alias-label-primary,#111);font:inherit;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}',
      '.pb-btn:hover{background:var(--dsw-alias-bg-layer-2,#eceef2)}',
      '.pb-btn:active{transform:translateY(1px)}',
      '.pb-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
      '.pb-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff}',
      '.pb-btn-primary:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 86%,#000)}',
      '.pb-stage{position:relative;flex:1 1 auto;min-height:0;display:flex;padding:10px 12px 6px;background:radial-gradient(120% 88% at 50% 0%,#0c1633 0%,#05070f 72%)}',
      '.pb-canvas{display:block;flex:1 1 auto;min-width:0;min-height:0;width:100%;height:100%;touch-action:none;cursor:default;border-radius:14px}',
      '.pb-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;padding:24px}',
      '.pb-card{pointer-events:auto;min-width:240px;max-width:340px;padding:20px 24px;border-radius:16px;background:var(--dsw-alias-bg-overlay,rgba(24,26,34,.92));color:var(--dsw-alias-label-primary,#fff);box-shadow:0 18px 48px rgba(0,0,0,.45),inset 0 0 0 1px var(--dsw-alias-border-l2,rgba(255,255,255,.18));text-align:center}',
      '.pb-card h2{margin:0 0 4px;font-size:18px;font-weight:600}',
      '.pb-card p{margin:0 0 14px;font-size:12.5px;color:var(--dsw-alias-label-secondary,#b9c0cc)}',
      '.pb-card-score{margin:6px 0 16px;font-size:30px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.01em}',
      '.pb-card-actions{display:flex;justify-content:center;gap:8px}',
      '.pb-hint{flex:none;display:flex;flex-wrap:wrap;justify-content:center;gap:6px 16px;padding:2px 16px 10px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280)}',
      '.pb-hint kbd{font:inherit;font-size:11px;padding:1px 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-1,#f4f5f7);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1,rgba(120,140,170,.25));color:var(--dsw-alias-label-primary,#111)}',
      '@media (max-width:720px){.pb-hud{order:3;flex-basis:100%;justify-content:flex-start}.pb-subtitle{display:none}}',
    ].join('');
    /* #endregion styles */

    /* #region components */
    const markSvg = h('svg', {
      width: 22, height: 22, viewBox: '0 0 64 64', 'aria-hidden': 'true',
    },
    h('defs', null,
      h('linearGradient', { id: 'pbMarkRim', x1: '10', y1: '6', x2: '54', y2: '58', gradientUnits: 'userSpaceOnUse' },
        h('stop', { offset: '0', stopColor: '#7ee3ff' }),
        h('stop', { offset: '0.5', stopColor: '#9a7bff' }),
        h('stop', { offset: '1', stopColor: '#ff5bd0' }))),
    h('path', { d: 'M12 26a20 20 0 0 1 40 0v18a20 20 0 0 1-4 8H16a20 20 0 0 1-4-8z', fill: 'none', stroke: 'url(#pbMarkRim)', strokeWidth: 4, strokeOpacity: 0.8 }),
    h('circle', { cx: '21.5', cy: '27', r: '6.2', fill: '#57d9ff' }),
    h('circle', { cx: '42.5', cy: '30', r: '5.4', fill: '#ff5bd0' }),
    h('circle', { cx: '32', cy: '19.5', r: '4.4', fill: '#ffcf5c' }),
    h('circle', { cx: '32', cy: '39.5', r: '4.6', fill: '#e6eefc' }),
    h('path', { d: 'M18 49.5 28 45', stroke: '#ff6d5c', strokeWidth: 4.6, strokeLinecap: 'round' }),
    h('path', { d: 'M46 49.5 36 45', stroke: '#5ca8ff', strokeWidth: 4.6, strokeLinecap: 'round' }));

    function PinballMark() {
      return h('span', { className: 'pb-mark', 'aria-hidden': 'true' }, markSvg);
    }

    function PinballIcon({ size, active }) {
      const edge = size || 18;
      return h('svg', {
        width: edge,
        height: edge,
        viewBox: '0 0 20 20',
        fill: 'none',
        'aria-hidden': 'true',
        style: {
          display: 'block',
          color: active ? 'var(--dsw-alias-brand-primary, #4d6bfe)' : 'currentColor',
        },
      },
      h('rect', { x: 3.1, y: 1.6, width: 13.8, height: 16.8, rx: 4.2, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('circle', { cx: 10.2, cy: 5.9, r: 1.8, fill: 'currentColor' }),
      h('path', { d: 'M6.4 8.6c1.4 1 3.2 1 4.6.1', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.72 }),
      h('path', { d: 'M7.2 14.7l2.3-1.6', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' }),
      h('path', { d: 'M12.8 14.7l-2.3-1.6', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' }));
    }

    function formatScore(value) {
      return String(Math.max(0, Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    let activeGame = null;
    let activeSound = null;
    let soundEnabled = true;

    function PinballPanel({ t }) {
      const translate = typeof t === 'function' ? t : (key) => key;
      const stageRef = useRef(null);
      const canvasRef = useRef(null);
      const gameRef = useRef(null);
      const soundRef = useRef(null);
      const soundOnRef = useRef(soundEnabled);
      const [soundOn, setSoundOn] = useState(soundEnabled);
      soundOnRef.current = soundOn;
      const [hud, setHud] = useState({
        score: 0, best: 0, ballNumber: 1, ballsLeft: 3, multiplier: 1, phase: 'ready',
      });

      useEffect(() => {
        const stage = stageRef.current;
        const canvas = canvasRef.current;
        if (!stage || !canvas) return undefined;
        const context = canvas.getContext('2d');
        if (!context) return undefined;

        const game = activeGame || createGame();
        activeGame = game;
        const sound = activeSound || createSound();
        activeSound = sound;
        sound.setEnabled(soundOnRef.current);
        gameRef.current = game;
        soundRef.current = sound;

        let frame = 0;
        let last = 0;
        let lastKey = '';
        let cssWidth = 1;
        let cssHeight = 1;
        let density = 1;
        let chargingPointer = false;
        let pointerId = null;

        const measure = () => {
          const rect = canvas.getBoundingClientRect();
          cssWidth = Math.max(1, rect.width);
          cssHeight = Math.max(1, rect.height);
          density = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.round(cssWidth * density);
          canvas.height = Math.round(cssHeight * density);
        };

        const observer = new ResizeObserver(measure);
        observer.observe(canvas);
        measure();

        const publish = () => {
          const snapshot = game.hud();
          const key = [
            snapshot.score, snapshot.best, snapshot.ballNumber,
            snapshot.ballsLeft, snapshot.multiplier, snapshot.phase,
          ].join('|');
          if (key !== lastKey) {
            lastKey = key;
            setHud(snapshot);
          }
        };

        const render = (time) => {
          frame = window.requestAnimationFrame(render);
          const dt = last ? (time - last) / 1000 : 1 / 60;
          last = time;
          game.step(dt);
          const events = game.takeEvents();
          for (const event of events) sound.play(event.kind);
          publish();
          context.setTransform(density, 0, 0, density, 0, 0);
          context.clearRect(0, 0, cssWidth, cssHeight);
          drawScene(context, game, cssWidth, cssHeight, time / 1000);
        };
        frame = window.requestAnimationFrame(render);

        const keyFor = (event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return null;
          switch (event.code) {
            case 'ArrowLeft':
            case 'KeyZ':
              return 'left';
            case 'ArrowRight':
            case 'Slash':
              return 'right';
            case 'Space':
              return 'space';
            case 'Enter':
              return 'enter';
            case 'KeyP':
              return 'pause';
            case 'KeyM':
              return 'mute';
            default:
              return null;
          }
        };

        const isTyping = (event) => {
          const target = event.target;
          if (!target || typeof target.closest !== 'function') return false;
          return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
        };

        const onKeyDown = (event) => {
          if (isTyping(event)) return;
          if (event.repeat) {
            if (event.code === 'Space') event.preventDefault();
            return;
          }
          const action = keyFor(event);
          if (!action) return;
          event.preventDefault();
          sound.unlock();
          if (action === 'mute') {
            setSoundOn((value) => {
              const next = !value;
              soundEnabled = next;
              sound.setEnabled(next);
              soundOnRef.current = next;
              return next;
            });
            return;
          }
          if (action === 'pause') {
            game.togglePause();
            publish();
            return;
          }
          game.press(action);
          publish();
        };

        const onKeyUp = (event) => {
          if (isTyping(event)) return;
          const action = keyFor(event);
          if (!action) return;
          if (action === 'left' || action === 'right' || action === 'space') {
            event.preventDefault();
            game.release(action);
          }
        };

        const onPointerDown = (event) => {
          if (event.button !== undefined && event.button !== 0) return;
          sound.unlock();
          pointerId = event.pointerId;
          if (typeof canvas.setPointerCapture === 'function') {
            try { canvas.setPointerCapture(event.pointerId); } catch (error) { pointerId = null; }
          }
          const snapshot = game.hud();
          if (snapshot.phase === 'ready') {
            chargingPointer = true;
            game.press('space');
            return;
          }
          const rect = canvas.getBoundingClientRect();
          const half = rect.left + rect.width / 2;
          game.press(event.clientX < half ? 'left' : 'right');
        };

        const onPointerUp = () => {
          if (pointerId !== null && typeof canvas.releasePointerCapture === 'function') {
            try { canvas.releasePointerCapture(pointerId); } catch (error) { pointerId = null; }
          }
          pointerId = null;
          game.release('left');
          game.release('right');
          if (chargingPointer) {
            chargingPointer = false;
            game.release('space');
          }
          publish();
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);

        return () => {
          window.cancelAnimationFrame(frame);
          observer.disconnect();
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('keyup', onKeyUp);
          canvas.removeEventListener('pointerdown', onPointerDown);
          canvas.removeEventListener('pointerup', onPointerUp);
          canvas.removeEventListener('pointercancel', onPointerUp);
          game.release('left');
          game.release('right');
          gameRef.current = null;
          soundRef.current = null;
        };
      }, []);


      const startGame = () => {
        const game = gameRef.current;
        if (!game) return;
        game.newGame();
        setHud(game.hud());
      };

      const togglePause = () => {
        const game = gameRef.current;
        if (!game) return;
        game.togglePause();
        setHud(game.hud());
      };

      const toggleSound = () => {
        setSoundOn((value) => {
          const next = !value;
          soundEnabled = next;
          soundOnRef.current = next;
          if (soundRef.current) soundRef.current.setEnabled(next);
          return next;
        });
      };

      const paused = hud.phase === 'paused';
      const over = hud.phase === 'over';

      return h('div', { className: 'pb-root' },
        h('style', null, CSS),
        h('header', { className: 'pb-head', 'data-window-drag': true },
          h('div', { className: 'pb-identity' },
            h(PinballMark),
            h('div', { style: { minWidth: 0 } },
              h('h1', { className: 'pb-title' }, translate('panel.title')),
              h('p', { className: 'pb-subtitle' }, translate('panel.subtitle')))),
          h('div', { className: 'pb-hud' },
            h('div', { className: 'pb-stat' },
              h('span', { className: 'pb-stat-label' }, translate('hud.score')),
              h('span', { className: 'pb-stat-value' }, formatScore(hud.score))),
            h('div', { className: 'pb-stat' },
              h('span', { className: 'pb-stat-label' }, translate('hud.ball')),
              h('span', { className: 'pb-stat-value' },
                over ? '—' : hud.ballNumber + ' / 3')),
            h('div', { className: 'pb-stat' },
              h('span', { className: 'pb-stat-label' }, translate('hud.multiplier')),
              h('span', { className: 'pb-stat-value' }, 'x' + hud.multiplier)),
            h('div', { className: 'pb-stat' },
              h('span', { className: 'pb-stat-label' }, translate('hud.best')),
              h('span', { className: 'pb-stat-value' }, formatScore(hud.best)))),
          h('div', { className: 'pb-actions' },
            h('button', {
              type: 'button',
              className: 'pb-btn pb-btn-primary',
              onClick: (event) => { event.currentTarget.blur(); startGame(); },
            }, translate('action.newGame')),
            h('button', {
              type: 'button',
              className: 'pb-btn',
              onClick: (event) => { event.currentTarget.blur(); togglePause(); },
              disabled: over,
            }, paused ? translate('action.resume') : translate('action.pause')),
            h('button', {
              type: 'button',
              className: 'pb-btn',
              'aria-pressed': soundOn,
              onClick: (event) => { event.currentTarget.blur(); toggleSound(); },
            }, soundOn ? translate('action.mute') : translate('action.unmute')))),
        h('div', { className: 'pb-stage', ref: stageRef },
          h('canvas', {
            ref: canvasRef,
            className: 'pb-canvas',
            role: 'application',
            'aria-label': translate('a11y.table'),
            tabIndex: 0,
          }),
          paused
            ? h('div', { className: 'pb-overlay' },
              h('div', { className: 'pb-card' },
                h('h2', null, translate('state.paused')),
                h('p', null, translate('state.pausedHint'))))
            : null,
          over
            ? h('div', { className: 'pb-overlay' },
              h('div', { className: 'pb-card' },
                h('h2', null, translate('state.over')),
                h('div', { className: 'pb-card-score' }, formatScore(hud.score)),
                h('p', null, translate('state.finalScoreLabel')),
                h('div', { className: 'pb-card-actions' },
                  h('button', {
                    type: 'button',
                    className: 'pb-btn pb-btn-primary',
                    onClick: startGame,
                  }, translate('action.playAgain')))))
            : null),
        h('footer', { className: 'pb-hint' },
          hud.phase === 'ready'
            ? h('span', null, h('kbd', null, 'Space'), ' ', translate('hint.ready'))
            : h('span', null, h('kbd', null, '←'), ' ', h('kbd', null, '→'), ' ', translate('hint.flippers')),
          hud.phase === 'ready'
            ? null
            : h('span', null, h('kbd', null, 'Space'), ' ', translate('hint.launch')),
          h('span', null, h('kbd', null, 'P'), ' ', translate('hint.pause'))));
    }
    /* #endregion components */

    const en = {
      'panel.title': '3D Pinball',
      'panel.subtitle': 'Space Cadet · Full Tilt',
      'hud.score': 'Score',
      'hud.ball': 'Ball',
      'hud.multiplier': 'Mult',
      'hud.best': 'Best',
      'action.newGame': 'New game',
      'action.pause': 'Pause',
      'action.resume': 'Resume',
      'action.playAgain': 'Play again',
      'action.mute': 'Sound on',
      'action.unmute': 'Sound off',
      'hint.ready': 'Hold Space to charge, release to launch',
      'hint.flippers': 'flippers',
      'hint.launch': 'launch',
      'hint.pause': 'pause',
      'state.paused': 'Paused',
      'state.pausedHint': 'Press P to keep playing.',
      'state.over': 'Game over',
      'state.finalScoreLabel': 'points banked',
      'a11y.table': 'Pinball table. Left and right arrow keys control the flippers.',
    };

    const zh = {
      'panel.title': '3D 弹球',
      'panel.subtitle': '太空学员 · Full Tilt',
      'hud.score': '得分',
      'hud.ball': '球数',
      'hud.multiplier': '倍数',
      'hud.best': '最高',
      'action.newGame': '新游戏',
      'action.pause': '暂停',
      'action.resume': '继续',
      'action.playAgain': '再来一局',
      'action.mute': '音效开',
      'action.unmute': '音效关',
      'hint.ready': '按住空格蓄力，松开发射',
      'hint.flippers': '挡板',
      'hint.launch': '发射',
      'hint.pause': '暂停',
      'state.paused': '已暂停',
      'state.pausedHint': '按 P 继续游戏。',
      'state.over': '游戏结束',
      'state.finalScoreLabel': '本局得分',
      'a11y.table': '弹球台。左右方向键控制挡板。',
    };

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'pinball: zh dictionary');
        ctx.effect(() => ctx.locale.register(NS, 'en', en), 'pinball: en dictionary');
        const t = ctx.locale.bind(NS);

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, PinballPanel));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 30,
          locale: NS,
          label: () => t('panel.title'),
        }, PinballIcon));
      },
    };
  },
});
