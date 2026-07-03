/*=============================================================================
    ASTRONIC DEFENSE
    MAIN APPLICATION SCRIPT
    Modular Vanilla JS — Navigation, Reveals, Telemetry, Timeline, Contact
=============================================================================*/

'use strict';

/*=============================================================================
    NAVIGATION CONTROLLER
=============================================================================*/

class NavigationController {

    constructor() {

        this.nav = document.querySelector('nav');
        this.menuButton = document.querySelector('.menu-button');
        this.navLinks = document.querySelector('.nav-links');
        this.links = document.querySelectorAll('.nav-links a');

        this.lastScrollY = window.scrollY;
        this.isMenuOpen = false;

        if (!this.nav) return;

        this._bindEvents();
        this._bindActiveSectionObserver();

    }

    _bindEvents() {

        window.addEventListener('scroll', () => this._onScroll(), { passive: true });

        if (this.menuButton) {
            this.menuButton.addEventListener('click', () => this._toggleMenu());
        }

        this.links.forEach(link => {
            link.addEventListener('click', () => {
                if (this.isMenuOpen) this._toggleMenu();
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMenuOpen) this._toggleMenu();
        });

    }

    _onScroll() {

        const currentY = window.scrollY;

        this.nav.classList.toggle('nav-scrolled', currentY > 40);
        this.lastScrollY = currentY;

    }

    _toggleMenu() {

        this.isMenuOpen = !this.isMenuOpen;
        this.navLinks.classList.toggle('nav-links-open', this.isMenuOpen);
        this.menuButton.classList.toggle('menu-button-active', this.isMenuOpen);
        this.menuButton.setAttribute('aria-expanded', String(this.isMenuOpen));
        document.body.classList.toggle('no-scroll', this.isMenuOpen);

    }

    _bindActiveSectionObserver() {

        const sections = document.querySelectorAll('main section[id]');
        if (!sections.length || !('IntersectionObserver' in window)) return;

        const observer = new IntersectionObserver((entries) => {

            entries.forEach(entry => {

                if (!entry.isIntersecting) return;

                const id = entry.target.getAttribute('id');

                this.links.forEach(link => {
                    const href = link.getAttribute('href') || '';
                    link.classList.toggle('active', href === `#${id}`);
                });

            });

        }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

        sections.forEach(section => observer.observe(section));

    }

}

/*=============================================================================
    SCROLL REVEAL CONTROLLER
    Adds a "revealed" class as elements enter the viewport.
=============================================================================*/

class ScrollRevealController {

    constructor(selector = '[data-reveal]') {

        this.elements = document.querySelectorAll(selector);
        if (!this.elements.length || !('IntersectionObserver' in window)) {
            this.elements.forEach(el => el.classList.add('is-revealed'));
            return;
        }

        this.observer = new IntersectionObserver(
            (entries) => this._onIntersect(entries),
            { threshold: 0.16, rootMargin: '0px 0px -60px 0px' }
        );

        this.elements.forEach(el => this.observer.observe(el));

    }

    _onIntersect(entries) {

        entries.forEach(entry => {

            if (!entry.isIntersecting) return;

            const delay = entry.target.dataset.revealDelay || 0;

            window.setTimeout(() => {
                entry.target.classList.add('is-revealed');
            }, Number(delay));

            this.observer.unobserve(entry.target);

        });

    }

}

/*=============================================================================
    METRIC COUNTER CONTROLLER
    Animates numeric values from 0 to target when scrolled into view.
=============================================================================*/

class MetricCounterController {

    constructor(selector = '[data-count-to]') {

        this.elements = document.querySelectorAll(selector);
        if (!this.elements.length || !('IntersectionObserver' in window)) return;

        this.observer = new IntersectionObserver(
            (entries) => this._onIntersect(entries),
            { threshold: 0.6 }
        );

        this.elements.forEach(el => this.observer.observe(el));

    }

    _onIntersect(entries) {

        entries.forEach(entry => {

            if (!entry.isIntersecting) return;
            this._animate(entry.target);
            this.observer.unobserve(entry.target);

        });

    }

    _animate(el) {

        const target = parseFloat(el.dataset.countTo);
        const duration = Number(el.dataset.countDuration || 1600);
        const decimals = el.dataset.countDecimals ? Number(el.dataset.countDecimals) : 0;
        const suffix = el.dataset.countSuffix || '';
        const start = performance.now();

        const step = (now) => {

            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = target * eased;

            el.textContent = value.toFixed(decimals) + suffix;

            if (progress < 1) requestAnimationFrame(step);
            else el.textContent = target.toFixed(decimals) + suffix;

        };

        requestAnimationFrame(step);

    }

}

/*=============================================================================
    TELEMETRY CHART
    Lightweight canvas line chart with animated live data feed.
=============================================================================*/

class TelemetryChart {

    constructor(canvasId, options = {}) {

        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.color = options.color || '16, 185, 129';
        this.pointCount = options.pointCount || 48;
        this.min = options.min ?? 0;
        this.max = options.max ?? 100;
        this.baseline = options.baseline ?? (this.min + this.max) / 2;
        this.volatility = options.volatility ?? 0.12;

        this.data = Array.from({ length: this.pointCount }, () => this.baseline);

        this._resize = this._resize.bind(this);
        this._tick = this._tick.bind(this);

        if ('ResizeObserver' in window) {
            new ResizeObserver(this._resize).observe(this.canvas.parentElement);
        }

        this._resize();

        this.lastUpdate = 0;
        this.interval = options.interval || 900;

        this._loop(performance.now());

    }

    _resize() {

        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;

        this.canvas.width = this.width * this.dpr;
        this.canvas.height = this.height * this.dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';

        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        this._render();

    }

    _tick() {

        const last = this.data[this.data.length - 1];
        const drift = (Math.random() - 0.5) * (this.max - this.min) * this.volatility;
        let next = last + drift + (this.baseline - last) * 0.08;
        next = Math.max(this.min, Math.min(this.max, next));

        this.data.push(next);
        this.data.shift();

    }

    _loop(now) {

        if (now - this.lastUpdate > this.interval) {
            this._tick();
            this._render();
            this.lastUpdate = now;
        }

        requestAnimationFrame(this._loop);

    }

    _render() {

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        // Grid baseline
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const y = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        const stepX = w / (this.data.length - 1);
        const range = this.max - this.min || 1;

        const toY = (v) => h - ((v - this.min) / range) * h;

        // Fill under line
        ctx.beginPath();
        ctx.moveTo(0, toY(this.data[0]));
        this.data.forEach((v, i) => ctx.lineTo(i * stepX, toY(v)));
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, `rgba(${this.color}, 0.22)`);
        gradient.addColorStop(1, `rgba(${this.color}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(0, toY(this.data[0]));
        this.data.forEach((v, i) => ctx.lineTo(i * stepX, toY(v)));
        ctx.strokeStyle = `rgba(${this.color}, 0.85)`;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Leading dot
        const lastX = (this.data.length - 1) * stepX;
        const lastY = toY(this.data[this.data.length - 1]);

        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.color}, 1)`;
        ctx.fill();

    }

}

/*=============================================================================
    RADIAL GAUGE
    SVG-driven confidence / load gauge with animated stroke-dashoffset.
=============================================================================*/

class RadialGauge {

    constructor(el) {

        this.el = el;
        this.circle = el.querySelector('.gauge-value-ring');
        this.label = el.querySelector('.gauge-value-label');
        if (!this.circle) return;

        this.radius = this.circle.r.baseVal.value;
        this.circumference = 2 * Math.PI * this.radius;

        this.circle.style.strokeDasharray = `${this.circumference} ${this.circumference}`;
        this.circle.style.strokeDashoffset = `${this.circumference}`;

        this.target = Number(el.dataset.gaugeValue || 0);

        if ('IntersectionObserver' in window) {

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this._animate();
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.5 });

            observer.observe(el);

        } else {
            this._animate();
        }

    }

    _animate() {

        const duration = 1400;
        const start = performance.now();

        const step = (now) => {

            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = this.target * eased;

            const offset = this.circumference - (value / 100) * this.circumference;
            this.circle.style.strokeDashoffset = String(offset);

            if (this.label) this.label.textContent = Math.round(value) + '%';

            if (progress < 1) requestAnimationFrame(step);

        };

        requestAnimationFrame(step);

    }

}

/*=============================================================================
    TIMELINE CONTROLLER
    Progressive highlight of operational timeline nodes on scroll.
=============================================================================*/

class TimelineController {

    constructor(selector = '.timeline-item') {

        this.items = document.querySelectorAll(selector);
        if (!this.items.length || !('IntersectionObserver' in window)) return;

        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    entry.target.classList.toggle('timeline-item-active', entry.isIntersecting);
                });
            },
            { threshold: 0.4, rootMargin: '-10% 0px -10% 0px' }
        );

        this.items.forEach(item => this.observer.observe(item));

    }

}

/*=============================================================================
    CONTACT FORM CONTROLLER
    Client-side validation + submission state machine (no backend wiring).
=============================================================================*/

class ContactFormController {

    constructor(formId) {

        this.form = document.getElementById(formId);
        if (!this.form) return;

        this.submitButton = this.form.querySelector('[type="submit"]');
        this.statusEl = this.form.querySelector('.form-status');

        this.form.addEventListener('submit', (e) => this._onSubmit(e));

        this.form.querySelectorAll('input, textarea, select').forEach(field => {
            field.addEventListener('blur', () => this._validateField(field));
        });

    }

    _validateField(field) {

        const wrapper = field.closest('.form-group');
        if (!wrapper) return true;

        let valid = field.checkValidity();
        wrapper.classList.toggle('form-group-error', !valid);

        return valid;

    }

    _onSubmit(e) {

        e.preventDefault();

        const fields = [...this.form.querySelectorAll('input, textarea, select')];
        const allValid = fields.every(f => this._validateField(f));

        if (!allValid) {

            this._setStatus('VALIDATION_ERROR // Review highlighted fields', 'error');
            return;

        }

        this._setStatus('TRANSMITTING...', 'pending');
        this.submitButton.disabled = true;

        window.setTimeout(() => {

            this._setStatus('MESSAGE_QUEUED // Our systems team will respond within 1–2 business days', 'success');
            this.submitButton.disabled = false;
            this.form.reset();

        }, 1100);

    }

    _setStatus(message, state) {

        if (!this.statusEl) return;

        this.statusEl.textContent = message;
        this.statusEl.dataset.state = state;

    }

}

/*=============================================================================
    CURRENT YEAR / BUILD STAMP
=============================================================================*/

class BuildStampController {

    constructor() {

        document.querySelectorAll('[data-current-year]').forEach(el => {
            el.textContent = new Date().getFullYear();
        });

    }

}

/*=============================================================================
    APPLICATION BOOTSTRAP
=============================================================================*/

class AstronicApp {

    constructor() {
        this._init();
    }

    _init() {

        new NavigationController();
        new ScrollRevealController();
        new MetricCounterController();
        new TimelineController();
        new ContactFormController('contactForm');
        new BuildStampController();

        this._initGauges();
        this._initTelemetryCharts();

    }

    _initGauges() {

        document.querySelectorAll('[data-gauge-value]').forEach(el => new RadialGauge(el));

    }

    _initTelemetryCharts() {

        const chartDefs = [
            { id: 'chartInference', color: '16, 185, 129', min: 60, max: 100, baseline: 92, volatility: 0.04 },
            { id: 'chartLatency', color: '255, 51, 51', min: 4, max: 40, baseline: 12, volatility: 0.18 },
            { id: 'chartThroughput', color: '16, 185, 129', min: 200, max: 900, baseline: 640, volatility: 0.1 },
        ];

        chartDefs.forEach(def => {
            if (document.getElementById(def.id)) new TelemetryChart(def.id, def);
        });

    }

}

window.addEventListener('DOMContentLoaded', () => {
    window.__astronicApp = new AstronicApp();
});

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
=============================================================================*/

/*=============================================================================
    CONTACT FORM — WHATSAPP / EMAIL DISPATCH
=============================================================================*/

const whatsappBtn = document.getElementById("whatsappBtn");
const emailBtn = document.getElementById("emailBtn");

function getFormData() {
    return {
        organization: document.getElementById("organization").value.trim(),
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        country: document.getElementById("country").value.trim(),
        industry: document.getElementById("industry").value,
        project: document.getElementById("project").value,
        timeline: document.getElementById("timeline").value,
        message: document.getElementById("message").value.trim()
    };
}

function buildMessage(data) {

    return `Hello Astronic Defense,

Organization: ${data.organization}
Representative: ${data.name}
Official Email: ${data.email}
Phone: ${data.phone}
Country: ${data.country}
Industry: ${data.industry}
Project Type: ${data.project}
Timeline: ${data.timeline}

Project Overview:
${data.message}`;
}

// WhatsApp
whatsappBtn.addEventListener("click", () => {

    const data = getFormData();

    if (!data.name || !data.email || !data.message) {
        alert("Please fill Name, Email and Project Overview.");
        return;
    }

    const text = encodeURIComponent(buildMessage(data));

    window.open(
        `https://wa.me/919520064368?text=${text}`,
        "_blank"
    );

});

// Email
emailBtn.addEventListener("click", () => {

    const data = getFormData();

    if (!data.name || !data.email || !data.message) {
        alert("Please fill Name, Email and Project Overview.");
        return;
    }

    const subject = encodeURIComponent(
        data.project || "Engineering Inquiry"
    );

    const body = encodeURIComponent(buildMessage(data));

    window.location.href =
        `mailto:akhileshpant2004@gmail.com?subject=${subject}&body=${body}`;

});
