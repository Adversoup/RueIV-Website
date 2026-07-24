#!/usr/bin/env python3
"""Overwrite rueiv-homepage.css with editorial v4 design system."""

CSS = """\
/* ====================================================================
   RueIV Homepage — Premium Editorial Showroom v4
   ====================================================================
   Design direction: Large-image · oversized-typography · editorial pacing
   Quiet luxury · confident negative space · premium minimalism
   Cinematic scroll · gallery-like rhythm
   ==================================================================== */

/* ── TYPOGRAPHY SCALE ──────────────────────────────────────────────
   H1 = 48 → 72px   (hero / cinematic titles)
   H2 = 36 → 48px   (section headings)
   H3 = 22 → 28px   (category / card titles)
   H4 = 18px         (product / sub-section titles)
   H5 = 14px         (kickers / eyebrow text)
   P  = 15px         (body / descriptions — minimum)
   ────────────────────────────────────────────────────────────────── */

.rueiv-section p,
.rueiv-section li {
  font-size: 15px;
  line-height: 1.75;
}

.rueiv-section h1 {
  font-family: var(--font-heading-family);
  font-size: clamp(40px, 5vw, 72px);
  font-weight: 100;
  letter-spacing: 0.16em;
  line-height: 1.06;
  text-transform: uppercase;
  margin: 0;
}

.rueiv-section h2,
.rueiv-section-heading {
  font-family: var(--font-heading-family);
  font-size: clamp(30px, 3.8vw, 48px);
  font-weight: 200;
  letter-spacing: 0.22em;
  line-height: 1.1;
  text-transform: uppercase;
  text-align: center;
  margin: 0 0 52px;
  color: rgb(var(--color-foreground));
}

.rueiv-section h3 {
  font-family: var(--font-heading-family);
  font-size: 24px;
  font-weight: 300;
  letter-spacing: 0.12em;
  line-height: 1.25;
  text-transform: uppercase;
  margin: 0;
}

.rueiv-section h4 {
  font-family: var(--font-body-family);
  font-size: 18px;
  font-weight: 400;
  letter-spacing: 0.04em;
  line-height: 1.4;
  margin: 0;
}

.rueiv-section h5 {
  font-family: var(--font-body-family);
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0.22em;
  line-height: 1.4;
  text-transform: uppercase;
  margin: 0;
  color: rgba(var(--color-foreground), 0.45);
}

/* ── IMAGE UTILITIES ─────────────────────────────────────────────── */
.rueiv-img-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rueiv-img-wrap {
  overflow: hidden;
  position: relative;
}

.rueiv-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* ── SHARED TOKENS ───────────────────────────────────────────────── */
.rueiv-section {
  --rueiv-gap: 160px;
}

.rueiv-section + .rueiv-section {
  margin-block-start: var(--rueiv-gap);
}

.rueiv-page-width {
  max-width: 1440px;
  margin-inline: auto;
  padding-inline: clamp(20px, 4vw, 60px);
}

.rueiv-subtext {
  font-size: 15px;
  line-height: 1.8;
  opacity: 0.5;
  text-align: center;
  max-width: 540px;
  margin: -32px auto 56px;
}

/* ── Buttons ── */
.rueiv-btn {
  display: inline-block;
  font-family: var(--font-body-family);
  font-weight: 400;
  font-size: 13px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  text-decoration: none;
  padding: 17px 52px;
  transition: all 0.35s ease;
  cursor: pointer;
  border: none;
}

.rueiv-btn--primary {
  background: rgb(var(--color-foreground));
  color: rgb(var(--color-background));
}

.rueiv-btn--primary:hover { opacity: 0.85; }

.rueiv-btn--outline {
  background: transparent;
  border: 1px solid rgba(var(--color-foreground), 0.3);
  color: rgb(var(--color-foreground));
}

.rueiv-btn--outline:hover {
  background: rgb(var(--color-foreground));
  color: rgb(var(--color-background));
  border-color: rgb(var(--color-foreground));
}

.rueiv-btn--light {
  border-color: rgba(255,255,255,0.45);
  color: #fff;
}

.rueiv-btn--light:hover {
  background: #fff;
  color: #111;
  border-color: #fff;
}

.rueiv-section-footer {
  text-align: center;
  margin-top: 56px;
}

/* ====================================================================
   1. HERO — Full-viewport cinematic opening
   ==================================================================== */
.rueiv-hero {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 560px;
  max-height: 1100px;
  overflow: hidden;
}

.rueiv-hero__slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 1.6s ease;
  z-index: 0;
}

.rueiv-hero__slide.is-active {
  opacity: 1;
  z-index: 1;
}

.rueiv-hero__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rueiv-hero__img--mobile { display: none; }

.rueiv-hero__placeholder {
  width: 100%;
  height: 100%;
  background: #d5d0c8;
}

.rueiv-hero__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0,0,0,0.40) 0%,
    rgba(0,0,0,0.18) 30%,
    rgba(0,0,0,0.06) 60%,
    rgba(0,0,0,0.03) 100%
  );
}

.rueiv-hero__content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: clamp(40px, 6vw, 88px);
  color: #fff;
  max-width: 720px;
}

.rueiv-hero__content--centered {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: clamp(24px, 4vw, 80px);
  color: #fff;
  max-width: none;
  pointer-events: none;
}

.rueiv-hero__heading--huge {
  font-family: var(--font-heading-family);
  font-weight: 100;
  font-size: clamp(34px, 7vw, 92px);
  letter-spacing: 0.20em;
  line-height: 1.03;
  text-transform: uppercase;
  color: #fff;
  margin: 0 0 28px;
  max-width: 1020px;
}

.rueiv-hero__subtitle {
  font-family: var(--font-body-family);
  font-size: clamp(12px, 1.5vw, 17px);
  font-weight: 300;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  opacity: 0.82;
  margin: 0;
}

.rueiv-hero__kicker {
  font-family: var(--font-body-family);
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  margin-bottom: 14px;
  opacity: 0.65;
}

.rueiv-hero__heading {
  font-family: var(--font-heading-family);
  font-weight: 200;
  font-size: clamp(34px, 4.5vw, 56px);
  letter-spacing: 0.14em;
  line-height: 1.06;
  margin-bottom: 18px;
  color: #fff;
  text-transform: uppercase;
}

.rueiv-hero__desc {
  font-size: 15px;
  line-height: 1.85;
  opacity: 0.82;
  margin-bottom: 28px;
  max-width: 480px;
}

.rueiv-hero__btns {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

/* Sub-banner — warm taupe editorial bar */
.rueiv-hero-banner {
  background: #a89382;
  color: #fff;
  text-align: center;
  padding: 20px 32px;
  font-family: var(--font-body-family);
  font-size: 13px;
  letter-spacing: 0.10em;
  line-height: 1.75;
  font-weight: 300;
}

/* ====================================================================
   2. CATEGORY GATEWAY — Large editorial navigation panels
   ==================================================================== */
.rueiv-gateway__grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
}

/* Row 1: full-width cinematic panoramic */
.rueiv-gateway__tile:nth-child(1) {
  grid-column: 1 / -1;
}
.rueiv-gateway__tile:nth-child(1) .rueiv-gateway__img-wrap {
  aspect-ratio: 2.8 / 1;
}

/* Row 2: three portrait tiles */
.rueiv-gateway__tile:nth-child(2),
.rueiv-gateway__tile:nth-child(3),
.rueiv-gateway__tile:nth-child(4) {
  grid-column: span 2;
}
.rueiv-gateway__tile:nth-child(2) .rueiv-gateway__img-wrap,
.rueiv-gateway__tile:nth-child(3) .rueiv-gateway__img-wrap,
.rueiv-gateway__tile:nth-child(4) .rueiv-gateway__img-wrap {
  aspect-ratio: 3 / 4;
}

/* Row 3: two landscape tiles */
.rueiv-gateway__tile:nth-child(5),
.rueiv-gateway__tile:nth-child(6) {
  grid-column: span 3;
}
.rueiv-gateway__tile:nth-child(5) .rueiv-gateway__img-wrap,
.rueiv-gateway__tile:nth-child(6) .rueiv-gateway__img-wrap {
  aspect-ratio: 16 / 9;
}

.rueiv-gateway__tile {
  position: relative;
  overflow: hidden;
  text-decoration: none;
  color: #fff;
  display: block;
}

.rueiv-gateway__img-wrap {
  overflow: hidden;
  position: relative;
  width: 100%;
}

.rueiv-gateway__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 1s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.rueiv-gateway__placeholder {
  width: 100%;
  height: 100%;
  background: #d5d0c8;
}

.rueiv-gateway__tile:hover .rueiv-gateway__img {
  transform: scale(1.035);
}

/* Overlay: quiet dark wash for legibility */
.rueiv-gateway__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.20);
  transition: background 0.5s ease;
}

.rueiv-gateway__tile:hover .rueiv-gateway__overlay {
  background: rgba(0,0,0,0.30);
}

/* Labels — centered, oversized editorial type */
.rueiv-gateway__label {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading-family);
  font-weight: 200;
  font-size: clamp(26px, 3.4vw, 44px);
  letter-spacing: 0.26em;
  text-transform: uppercase;
  text-align: center;
  padding: 16px;
}

/* Feature tile (first) — even larger */
.rueiv-gateway__tile:nth-child(1) .rueiv-gateway__label {
  font-size: clamp(32px, 5vw, 68px);
  letter-spacing: 0.30em;
  font-weight: 100;
}

/* ====================================================================
   3. VIBE STUDIO — Editorial sourcing feature
   ==================================================================== */
.rueiv-vibe__intro {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  align-items: stretch;
}

.rueiv-vibe__image-col {
  position: relative;
  overflow: hidden;
  min-height: 600px;
}

.rueiv-vibe__image-col img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rueiv-vibe__text-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(44px, 5vw, 100px);
  background: #f7f5f2;
}

.rueiv-vibe__text-col h5 {
  margin-bottom: 18px;
}

.rueiv-vibe__text-col h2 {
  text-align: left;
  margin: 0 0 24px;
  font-size: clamp(26px, 3vw, 44px);
}

.rueiv-vibe__text-col > p {
  font-size: 15px;
  line-height: 1.85;
  opacity: 0.6;
  margin: 0 0 42px;
  max-width: 440px;
}

/* How It Works steps */
.rueiv-vibe__steps {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-bottom: 42px;
}

.rueiv-vibe__step {
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

.rueiv-vibe__step-num {
  font-family: var(--font-heading-family);
  font-size: 32px;
  font-weight: 100;
  letter-spacing: 0.05em;
  opacity: 0.18;
  line-height: 1;
  flex-shrink: 0;
  width: 36px;
}

.rueiv-vibe__step-text h4 {
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.rueiv-vibe__step-text p {
  font-size: 14px;
  opacity: 0.5;
  margin: 0;
  line-height: 1.65;
}

.rueiv-vibe__micro {
  font-size: 13px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  opacity: 0.32;
  margin-bottom: 32px;
}

/* Moodboard cards */
.rueiv-vibe__boards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(20px, 2.5vw, 32px);
  margin-top: 80px;
}

.rueiv-vibe__board-card {
  text-decoration: none;
  color: rgb(var(--color-foreground));
  display: block;
}

.rueiv-vibe__board-img {
  aspect-ratio: 3 / 4;
  overflow: hidden;
}

.rueiv-vibe__board-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.8s ease;
}

.rueiv-vibe__board-img .rueiv-placeholder {
  width: 100%;
  height: 100%;
  background: #e8e5e0;
}

.rueiv-vibe__board-card:hover .rueiv-vibe__board-img img {
  transform: scale(1.03);
}

.rueiv-vibe__board-info {
  padding-top: 18px;
}

.rueiv-vibe__board-info h3 {
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 0.12em;
  margin-bottom: 6px;
}

.rueiv-vibe__board-info p {
  font-size: 14px;
  opacity: 0.45;
  line-height: 1.65;
  margin: 0;
}

/* ====================================================================
   4. PRODUCT RAIL — Shared: Trending + New Arrivals
   ==================================================================== */
.rueiv-rail__inner {
  text-align: center;
}

.rueiv-rail__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: clamp(20px, 2.5vw, 32px);
  text-align: left;
}

/* ── Shared Product Card — restrained, large image ── */
.rueiv-pcard {
  text-decoration: none;
  color: rgb(var(--color-foreground));
  display: block;
}

.rueiv-pcard__img-wrap {
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: #f0eeeb;
}

.rueiv-pcard__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.rueiv-pcard__placeholder {
  width: 100%;
  height: 100%;
  background: #e8e5e0;
}

.rueiv-pcard:hover .rueiv-pcard__img {
  transform: scale(1.03);
}

.rueiv-pcard__info {
  padding-top: 16px;
}

.rueiv-pcard__vendor {
  font-size: 12px;
  opacity: 0.4;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin: 0 0 6px;
}

.rueiv-pcard__title {
  font-family: var(--font-body-family);
  font-weight: 400;
  font-size: 15px;
  letter-spacing: 0.02em;
  line-height: 1.45;
  margin: 0;
}

.rueiv-pcard__price { display: none !important; }

/* ====================================================================
   5. QUICK SHIP — Product rail variant
   ==================================================================== */
.rueiv-qs__inner {
  text-align: center;
}

.rueiv-qs__desc {
  font-size: 15px;
  line-height: 1.8;
  opacity: 0.5;
  text-align: center;
  max-width: 540px;
  margin: -32px auto 56px;
}

.rueiv-qs__rail {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: clamp(20px, 2.5vw, 32px);
  text-align: left;
}

.rueiv-qs__footer {
  text-align: center;
  margin-top: 56px;
}

/* ====================================================================
   6. PROJECT READY — Premium utility gateway
   ==================================================================== */
.rueiv-ready__inner {
  text-align: center;
}

.rueiv-ready__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(20px, 2.5vw, 32px);
}

.rueiv-ready__card {
  text-decoration: none;
  color: rgb(var(--color-foreground));
  display: block;
  text-align: center;
}

.rueiv-ready__img-wrap {
  aspect-ratio: 3 / 4;
  overflow: hidden;
  position: relative;
}

.rueiv-ready__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.8s ease;
}

.rueiv-ready__placeholder {
  width: 100%;
  height: 100%;
  background: #e8e5e0;
}

.rueiv-ready__card:hover .rueiv-ready__img {
  transform: scale(1.03);
}

.rueiv-ready__card h3 {
  font-size: 18px;
  letter-spacing: 0.16em;
  margin-top: 22px;
  font-weight: 300;
}

.rueiv-ready__card p {
  font-size: 14px;
  opacity: 0.45;
  margin-top: 6px;
}

/* ====================================================================
   7. TESTIMONIALS — Large-quote editorial pause
   ==================================================================== */
.rueiv-testimonials {
  text-align: center;
  padding-block: 40px;
}

.rueiv-testimonials__inner {
  max-width: 880px;
  margin-inline: auto;
}

.rueiv-testimonials__track {
  position: relative;
  min-height: 240px;
}

.rueiv-testimonials__card {
  border: none;
  margin: 0;
  padding: 0;
  opacity: 0;
  position: absolute;
  inset: 0;
  transition: opacity 0.7s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.rueiv-testimonials__card.is-active {
  opacity: 1;
  position: relative;
}

.rueiv-testimonials__quote {
  font-family: var(--font-heading-family);
  font-size: clamp(22px, 2.8vw, 36px);
  font-weight: 200;
  letter-spacing: 0.03em;
  line-height: 1.5;
  font-style: normal;
  margin: 0 0 36px;
  color: rgb(var(--color-foreground));
}

.rueiv-testimonials__author {
  font-family: var(--font-body-family);
  font-size: 13px;
  font-style: normal;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  opacity: 0.5;
  display: block;
}

.rueiv-testimonials__role {
  font-size: 13px;
  opacity: 0.32;
  display: block;
  margin-top: 6px;
}

.rueiv-testimonials__nav {
  display: flex;
  justify-content: center;
  gap: 28px;
  margin-top: 44px;
}

.rueiv-testimonials__prev,
.rueiv-testimonials__next {
  background: none;
  border: 1px solid rgba(var(--color-foreground), 0.14);
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  color: rgb(var(--color-foreground));
  transition: all 0.35s;
}

.rueiv-testimonials__prev:hover,
.rueiv-testimonials__next:hover {
  background: rgb(var(--color-foreground));
  color: rgb(var(--color-background));
  border-color: rgb(var(--color-foreground));
}

/* ====================================================================
   8. EVENTS — Editorial culture / showroom life
   ==================================================================== */
.rueiv-events__inner {
  max-width: 1440px;
  margin-inline: auto;
  padding-inline: clamp(20px, 4vw, 60px);
}

.rueiv-events__sub {
  font-size: 15px;
  text-align: center;
  opacity: 0.45;
  letter-spacing: 0.08em;
  margin: -32px 0 56px;
}

.rueiv-events__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(20px, 2.5vw, 32px);
}

.rueiv-events__card {
  text-decoration: none;
  color: rgb(var(--color-foreground));
}

.rueiv-events__card a {
  text-decoration: none;
  color: inherit;
  display: block;
}

.rueiv-events__img-wrap {
  aspect-ratio: 4 / 5;
  overflow: hidden;
  background: #f0eeeb;
}

.rueiv-events__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.8s ease;
}

.rueiv-events__placeholder {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.rueiv-events__card:hover .rueiv-events__img,
.rueiv-events__card a:hover .rueiv-events__img {
  transform: scale(1.03);
}

.rueiv-events__title {
  font-family: var(--font-body-family);
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.08em;
  margin: 20px 0 6px;
}

.rueiv-events__date {
  font-size: 13px;
  opacity: 0.38;
  margin: 0;
  letter-spacing: 0.08em;
}

/* ====================================================================
   9. NEWSLETTER — Exclusive insider editorial signup
   ==================================================================== */
.rueiv-newsletter__layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  align-items: stretch;
}

.rueiv-newsletter__layout--centered {
  grid-template-columns: 1fr;
}

.rueiv-newsletter__image-col {
  overflow: hidden;
  min-height: 460px;
}

.rueiv-newsletter__image-col img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rueiv-newsletter__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: clamp(48px, 6vw, 100px);
  background: #f7f5f2;
}

.rueiv-newsletter__layout--centered .rueiv-newsletter__content {
  padding-block: 100px;
  max-width: 560px;
  margin-inline: auto;
  background: transparent;
}

.rueiv-newsletter__content h2 {
  margin-bottom: 24px;
  font-size: clamp(26px, 3.2vw, 44px);
}

.rueiv-newsletter__desc {
  font-size: 15px;
  line-height: 1.85;
  opacity: 0.5;
  margin-bottom: 36px;
  max-width: 380px;
}

.rueiv-newsletter__desc p { margin: 0; }

.rueiv-newsletter__form {
  display: flex;
  gap: 0;
  width: 100%;
  max-width: 420px;
}

.rueiv-newsletter__input {
  flex: 1;
  border: 1px solid rgba(var(--color-foreground), 0.18);
  border-right: none;
  padding: 16px 20px;
  font-family: var(--font-body-family);
  font-size: 14px;
  letter-spacing: 0.06em;
  background: transparent;
  color: rgb(var(--color-foreground));
  outline: none;
}

.rueiv-newsletter__input:focus {
  border-color: rgb(var(--color-foreground));
}

.rueiv-newsletter__form .rueiv-btn {
  white-space: nowrap;
  border-left: none;
}

.rueiv-newsletter__success {
  margin-top: 16px;
  font-size: 14px;
  color: #2a7a3f;
}

.rueiv-newsletter__error {
  margin-top: 16px;
  font-size: 14px;
  color: #c0392b;
}

/* ====================================================================
   10. CLOSING BANNER — Bold typographic brand signature
   ==================================================================== */
.rueiv-banner {
  position: relative;
  overflow: hidden;
  min-height: 540px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rueiv-banner__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rueiv-banner__bg--placeholder {
  background-color: #1e1c1a;
  background-size: cover;
  background-position: center;
}

.rueiv-banner__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.46);
}

.rueiv-banner__content {
  position: relative;
  z-index: 1;
  text-align: center;
  color: #fff;
  padding: clamp(56px, 10vw, 120px) 24px;
  max-width: 860px;
}

.rueiv-banner__heading {
  font-family: var(--font-heading-family);
  font-size: clamp(30px, 4.5vw, 60px);
  font-weight: 100;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  line-height: 1.08;
  margin: 0 0 22px;
  color: #fff;
}

.rueiv-banner__sub {
  font-size: 14px;
  letter-spacing: 0.20em;
  text-transform: uppercase;
  opacity: 0.55;
  margin: 0 0 36px;
  line-height: 1.75;
}

/* ====================================================================
   RESPONSIVE
   ==================================================================== */

/* ── Tablet ── */
@media (max-width: 1023px) {
  .rueiv-section { --rueiv-gap: 120px; }

  .rueiv-rail__grid { grid-template-columns: repeat(2, 1fr); }
  .rueiv-qs__rail { grid-template-columns: repeat(2, 1fr); }
  .rueiv-ready__grid { grid-template-columns: repeat(3, 1fr); }
  .rueiv-events__grid { grid-template-columns: repeat(2, 1fr); }
  .rueiv-vibe__boards { grid-template-columns: repeat(2, 1fr); }

  /* Gateway: 2-col */
  .rueiv-gateway__grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .rueiv-gateway__tile:nth-child(1) { grid-column: 1 / -1; }
  .rueiv-gateway__tile:nth-child(2),
  .rueiv-gateway__tile:nth-child(3),
  .rueiv-gateway__tile:nth-child(4) { grid-column: span 1; }
  .rueiv-gateway__tile:nth-child(4) { grid-column: 1 / -1; }
  .rueiv-gateway__tile:nth-child(5),
  .rueiv-gateway__tile:nth-child(6) { grid-column: span 1; }
  .rueiv-gateway__tile:nth-child(2) .rueiv-gateway__img-wrap,
  .rueiv-gateway__tile:nth-child(3) .rueiv-gateway__img-wrap,
  .rueiv-gateway__tile:nth-child(4) .rueiv-gateway__img-wrap {
    aspect-ratio: 3 / 2;
  }
}

/* ── Mobile ── */
@media (max-width: 767px) {
  .rueiv-section { --rueiv-gap: 96px; }

  .rueiv-section h1 { font-size: 32px; }
  .rueiv-section h2,
  .rueiv-section-heading { font-size: 24px; margin-bottom: 32px; }
  .rueiv-section h3 { font-size: 20px; }

  .rueiv-hero__heading--huge { font-size: 30px; letter-spacing: 0.14em; }
  .rueiv-hero__subtitle { letter-spacing: 0.20em; }
  .rueiv-hero__img--desktop { display: none; }
  .rueiv-hero__img--mobile { display: block; }

  /* Gateway: single col */
  .rueiv-gateway__grid { grid-template-columns: 1fr; gap: 10px; }
  .rueiv-gateway__tile:nth-child(n) { grid-column: 1 / -1; }
  .rueiv-gateway__tile:nth-child(1) .rueiv-gateway__img-wrap { aspect-ratio: 16 / 9; }
  .rueiv-gateway__tile:nth-child(n+2) .rueiv-gateway__img-wrap { aspect-ratio: 4 / 3; }
  .rueiv-gateway__label { font-size: 22px !important; letter-spacing: 0.18em !important; }

  /* Vibe Studio */
  .rueiv-vibe__intro { grid-template-columns: 1fr; }
  .rueiv-vibe__image-col { min-height: 320px; }
  .rueiv-vibe__text-col h2 { font-size: 24px; }
  .rueiv-vibe__boards { grid-template-columns: 1fr; }

  /* Product rail */
  .rueiv-rail__grid { grid-template-columns: repeat(2, 1fr); }
  .rueiv-qs__rail { grid-template-columns: repeat(2, 1fr); }

  /* Project Ready */
  .rueiv-ready__grid { grid-template-columns: 1fr; }

  /* Events */
  .rueiv-events__grid { grid-template-columns: 1fr; }

  /* Testimonials */
  .rueiv-testimonials__quote { font-size: 20px; }
  .rueiv-testimonials__track { min-height: 200px; }

  /* Newsletter */
  .rueiv-newsletter__layout { grid-template-columns: 1fr; }
  .rueiv-newsletter__image-col { min-height: 280px; }
  .rueiv-newsletter__content h2 { font-size: 24px; }
  .rueiv-newsletter__form { flex-direction: column; gap: 8px; }
  .rueiv-newsletter__input {
    border-right: 1px solid rgba(var(--color-foreground), 0.18);
  }
  .rueiv-newsletter__form .rueiv-btn {
    border-left: 1px solid rgb(var(--color-foreground));
  }

  /* Banner */
  .rueiv-banner__heading { font-size: 26px; letter-spacing: 0.16em; }
  .rueiv-banner { min-height: 380px; }

  /* Buttons */
  .rueiv-btn { padding: 15px 36px; font-size: 12px; }
}

/* ── Desktop Large ── */
@media (min-width: 768px) {
  .rueiv-hero__heading { font-size: 56px; }
}

@media (min-width: 1200px) {
  .rueiv-gateway__grid { gap: 20px; }
}
"""

with open("/Users/Darkside/RueIV-Shopify/theme/assets/rueiv-homepage.css", "w") as f:
    f.write(CSS)
print(f"Written {len(CSS)} chars OK")
