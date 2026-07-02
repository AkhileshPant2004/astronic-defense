/*=============================================================================
    ASTRONIC DEFENSE
    TACTICAL RADAR ENGINE
    High-DPI · Object-Pooled · RAF-Driven Canvas Visualization
=============================================================================*/

'use strict';

/*=============================================================================
    CONFIG
=============================================================================*/

const RADAR_CONFIG = Object.freeze({

    ringCount: 4,
    sweepSpeed: 0.006,          // radians per ms
    sweepArc: (Math.PI / 180) * 55,
    sweepFadeSteps: 90,

    targetCount: 9,
    targetMinSpeed: 0.00006,
    targetMaxSpeed: 0.00018,
    trailLength: 26,

    gridMinorSpacing: 32,
    gridMajorEvery: 4,

    colorEmerald: '16, 185, 129',
    colorCrimson: '255, 51, 51',
    colorGridLine: '255, 255, 255',

    labelFont: '10px "JetBrains Mono", monospace',

});

/*=============================================================================
    UTILS
=============================================================================*/

const RadarUtils = {

    rand(min, max) {
        return min + Math.random() * (max - min);
    },

    clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    },

    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    dist(x1, y1, x2, y2) {
        return Math.hypot(x2 - x1, y2 - y1);
    },

};

/*=============================================================================
    TRACKED TARGET
    Represents a single blip orbiting / drifting within the radar field.
    Pooled and reset rather than reallocated.
=============================================================================*/

class TrackedTarget {

    constructor() {
        this.active = false;
        this.reset(0, 0, 0);
    }

    reset(cx, cy, maxRadius) {

        this.angle = RadarUtils.rand(0, Math.PI * 2);
        this.radius = RadarUtils.rand(maxRadius * 0.15, maxRadius * 0.92);
        this.angularVelocity = RadarUtils.rand(
            RADAR_CONFIG.targetMinSpeed,
            RADAR_CONFIG.targetMaxSpeed
        ) * (Math.random() > 0.5 ? 1 : -1);

        this.radialDrift = RadarUtils.rand(-0.004, 0.004);
        this.maxRadius = maxRadius;
        this.cx = cx;
        this.cy = cy;

        this.id = 'TGT-' + Math.floor(1000 + Math.random() * 8999);
        this.classification = Math.random() > 0.82 ? 'HOSTILE' : 'FRIENDLY';
        this.altitude = Math.floor(RadarUtils.rand(800, 42000));

        this.trail = [];
        this.active = true;
        this.pulsePhase = Math.random() * Math.PI * 2;

    }

    update(dt) {

        this.angle += this.angularVelocity * dt;
        this.radius += this.radialDrift * dt;
        this.radius = RadarUtils.clamp(this.radius, this.maxRadius * 0.12, this.maxRadius * 0.96);
        this.pulsePhase += dt * 0.004;

        const x = this.cx + Math.cos(this.angle) * this.radius;
        const y = this.cy + Math.sin(this.angle) * this.radius;

        this.trail.push({ x, y });
        if (this.trail.length > RADAR_CONFIG.trailLength) {
            this.trail.shift();
        }

        this.x = x;
        this.y = y;

    }

}

/*=============================================================================
    TARGET POOL
=============================================================================*/

class TargetPool {

    constructor(size) {
        this.pool = Array.from({ length: size }, () => new TrackedTarget());
    }

    activateAll(cx, cy, maxRadius) {
        this.pool.forEach(t => t.reset(cx, cy, maxRadius));
    }

    forEach(fn) {
        this.pool.forEach(fn);
    }

}

/*=============================================================================
    RADAR ENGINE
    Owns the canvas lifecycle: resize, render pipeline, sweep, grid, targets.
=============================================================================*/

class RadarEngine {

    constructor(canvasId) {

        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.width = 0;
        this.height = 0;
        this.cx = 0;
        this.cy = 0;
        this.maxRadius = 0;

        this.sweepAngle = 0;
        this.lastTime = 0;
        this.rafId = null;
        this.isVisible = true;
        this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.pool = new TargetPool(RADAR_CONFIG.targetCount);

        this._onResize = this._onResize.bind(this);
        this._loop = this._loop.bind(this);

        this._bindResizeObserver();
        this._resize();
        this._bindVisibilityObserver();

        if (!this.isReducedMotion) {
            this.rafId = requestAnimationFrame(this._loop);
        } else {
            this._renderStaticFrame();
        }

    }

    /*-------------------------------------------------------------------
        RESPONSIVE SETUP
    -------------------------------------------------------------------*/

    _bindResizeObserver() {

        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(this._onResize);
            this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
        } else {
            window.addEventListener('resize', this._onResize, { passive: true });
        }

    }

    _bindVisibilityObserver() {

        if ('IntersectionObserver' in window) {

            this.intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    this.isVisible = entry.isIntersecting;
                    if (this.isVisible && !this.rafId && !this.isReducedMotion) {
                        this.lastTime = performance.now();
                        this.rafId = requestAnimationFrame(this._loop);
                    }
                });
            }, { threshold: 0.01 });

            this.intersectionObserver.observe(this.canvas);

        }

    }

    _onResize() {
        this._resize();
        if (this.isReducedMotion) this._renderStaticFrame();
    }

    _resize() {

        const rect = (this.canvas.parentElement || this.canvas).getBoundingClientRect();

        this.width = Math.max(rect.width, 1);
        this.height = Math.max(rect.height, 1);

        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';

        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        this.cx = this.width * 0.68;
        this.cy = this.height * 0.42;
        this.maxRadius = Math.min(this.width, this.height) * 0.46;

        this.pool.activateAll(this.cx, this.cy, this.maxRadius);

    }

    /*-------------------------------------------------------------------
        RENDER LOOP
    -------------------------------------------------------------------*/

    _loop(now) {

        if (!this.isVisible) {
            this.rafId = null;
            return;
        }

        const dt = this.lastTime ? Math.min(now - this.lastTime, 48) : 16.6;
        this.lastTime = now;

        this._update(dt);
        this._render();

        this.rafId = requestAnimationFrame(this._loop);

    }

    _update(dt) {

        this.sweepAngle += RADAR_CONFIG.sweepSpeed * dt;
        if (this.sweepAngle > Math.PI * 2) this.sweepAngle -= Math.PI * 2;

        this.pool.forEach(t => t.update(dt));

    }

    _renderStaticFrame() {
        this._render();
    }

    _render() {

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        this._drawGrid(ctx);
        this._drawRings(ctx);
        this._drawCrosshair(ctx);
        this._drawSweep(ctx);
        this._drawTargets(ctx);
        this._drawLabels(ctx);

    }

    /*-------------------------------------------------------------------
        GRID
    -------------------------------------------------------------------*/

    _drawGrid(ctx) {

        const spacing = RADAR_CONFIG.gridMinorSpacing;

        ctx.save();
        ctx.lineWidth = 1;

        for (let x = 0; x < this.width; x += spacing) {

            const isMajor = (Math.round(x / spacing) % RADAR_CONFIG.gridMajorEvery) === 0;
            ctx.strokeStyle = `rgba(${RADAR_CONFIG.colorGridLine}, ${isMajor ? 0.05 : 0.02})`;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();

        }

        for (let y = 0; y < this.height; y += spacing) {

            const isMajor = (Math.round(y / spacing) % RADAR_CONFIG.gridMajorEvery) === 0;
            ctx.strokeStyle = `rgba(${RADAR_CONFIG.colorGridLine}, ${isMajor ? 0.05 : 0.02})`;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();

        }

        ctx.restore();

    }

    /*-------------------------------------------------------------------
        RADAR RINGS
    -------------------------------------------------------------------*/

    _drawRings(ctx) {

        ctx.save();
        ctx.strokeStyle = `rgba(${RADAR_CONFIG.colorEmerald}, 0.16)`;
        ctx.lineWidth = 1;

        for (let i = 1; i <= RADAR_CONFIG.ringCount; i++) {

            const r = (this.maxRadius / RADAR_CONFIG.ringCount) * i;
            ctx.beginPath();
            ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
            ctx.stroke();

        }

        ctx.restore();

    }

    /*-------------------------------------------------------------------
        CROSSHAIR
    -------------------------------------------------------------------*/

    _drawCrosshair(ctx) {

        ctx.save();
        ctx.strokeStyle = `rgba(${RADAR_CONFIG.colorEmerald}, 0.14)`;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(this.cx - this.maxRadius, this.cy);
        ctx.lineTo(this.cx + this.maxRadius, this.cy);
        ctx.moveTo(this.cx, this.cy - this.maxRadius);
        ctx.lineTo(this.cx, this.cy + this.maxRadius);
        ctx.stroke();

        ctx.fillStyle = `rgba(${RADAR_CONFIG.colorEmerald}, 0.5)`;
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, 2.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

    }

    /*-------------------------------------------------------------------
        SWEEP BEAM
    -------------------------------------------------------------------*/

    _drawSweep(ctx) {

        ctx.save();

        const gradient = ctx.createConicGradient
            ? ctx.createConicGradient(this.sweepAngle - RADAR_CONFIG.sweepArc, this.cx, this.cy)
            : null;

        if (gradient) {

            gradient.addColorStop(0, `rgba(${RADAR_CONFIG.colorEmerald}, 0)`);
            gradient.addColorStop(0.92, `rgba(${RADAR_CONFIG.colorEmerald}, 0)`);
            gradient.addColorStop(1, `rgba(${RADAR_CONFIG.colorEmerald}, 0.22)`);

            ctx.beginPath();
            ctx.moveTo(this.cx, this.cy);
            ctx.arc(this.cx, this.cy, this.maxRadius, this.sweepAngle - RADAR_CONFIG.sweepArc, this.sweepAngle);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

        } else {

            // Fallback: layered arcs simulating fade
            const steps = 24;
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                const a0 = this.sweepAngle - RADAR_CONFIG.sweepArc * (1 - t);
                const a1 = this.sweepAngle - RADAR_CONFIG.sweepArc * (1 - t) + 0.02;
                ctx.beginPath();
                ctx.moveTo(this.cx, this.cy);
                ctx.arc(this.cx, this.cy, this.maxRadius, a0, a1);
                ctx.closePath();
                ctx.fillStyle = `rgba(${RADAR_CONFIG.colorEmerald}, ${0.22 * t})`;
                ctx.fill();
            }

        }

        // Leading edge line
        ctx.strokeStyle = `rgba(${RADAR_CONFIG.colorEmerald}, 0.7)`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(
            this.cx + Math.cos(this.sweepAngle) * this.maxRadius,
            this.cy + Math.sin(this.sweepAngle) * this.maxRadius
        );
        ctx.stroke();

        ctx.restore();

    }

    /*-------------------------------------------------------------------
        TARGETS + TRAILS
    -------------------------------------------------------------------*/

    _drawTargets(ctx) {

        this.pool.forEach(t => {

            if (!t.active || t.trail.length < 2) return;

            const color = t.classification === 'HOSTILE'
                ? RADAR_CONFIG.colorCrimson
                : RADAR_CONFIG.colorEmerald;

            // Trail
            ctx.save();
            ctx.lineWidth = 1.2;
            ctx.lineJoin = 'round';

            for (let i = 1; i < t.trail.length; i++) {

                const alpha = (i / t.trail.length) * 0.35;
                ctx.strokeStyle = `rgba(${color}, ${alpha})`;
                ctx.beginPath();
                ctx.moveTo(t.trail[i - 1].x, t.trail[i - 1].y);
                ctx.lineTo(t.trail[i].x, t.trail[i].y);
                ctx.stroke();

            }

            ctx.restore();

            // Blip
            const pulse = 1 + Math.sin(t.pulsePhase) * 0.25;

            ctx.save();
            ctx.fillStyle = `rgba(${color}, 0.9)`;
            ctx.beginPath();
            ctx.arc(t.x, t.y, 3.2 * pulse, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(${color}, 0.35)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(t.x, t.y, 8 * pulse, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();

        });

    }

    /*-------------------------------------------------------------------
        COORDINATE + TELEMETRY LABELS
    -------------------------------------------------------------------*/

    _drawLabels(ctx) {

        ctx.save();
        ctx.font = RADAR_CONFIG.labelFont;
        ctx.textBaseline = 'middle';

        // Ring range labels
        ctx.fillStyle = `rgba(${RADAR_CONFIG.colorEmerald}, 0.4)`;
        for (let i = 1; i <= RADAR_CONFIG.ringCount; i++) {
            const r = (this.maxRadius / RADAR_CONFIG.ringCount) * i;
            const km = i * 25;
            ctx.fillText(`${km}KM`, this.cx + 4, this.cy - r);
        }

        // Target telemetry
        this.pool.forEach(t => {

            if (!t.active) return;

            const color = t.classification === 'HOSTILE'
                ? RADAR_CONFIG.colorCrimson
                : RADAR_CONFIG.colorEmerald;

            ctx.fillStyle = `rgba(${color}, 0.55)`;
            ctx.fillText(`${t.id}`, t.x + 10, t.y - 6);
            ctx.fillStyle = `rgba(${RADAR_CONFIG.colorGridLine}, 0.28)`;
            ctx.fillText(`ALT ${t.altitude}FT`, t.x + 10, t.y + 6);

        });

        ctx.restore();

    }

    /*-------------------------------------------------------------------
        CLEANUP
    -------------------------------------------------------------------*/

    destroy() {

        if (this.rafId) cancelAnimationFrame(this.rafId);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.intersectionObserver) this.intersectionObserver.disconnect();
        window.removeEventListener('resize', this._onResize);

    }

}

/*=============================================================================
    BOOTSTRAP
=============================================================================*/

window.addEventListener('DOMContentLoaded', () => {

    if (document.getElementById('droneRadarCanvas')) {
        window.__astronicRadar = new RadarEngine('droneRadarCanvas');
    }

});