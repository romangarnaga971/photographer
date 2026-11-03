import { createDarkroom } from './darkroom.js';
import { setLang, initialLang, texts } from './i18n.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

// In the order they pass on the film. Aspect is width over height.
const PHOTOS = [
  ['P-01', 0.747], ['P-03', 0.747], ['P-02', 1.339], ['P-04', 0.747], ['P-05', 0.747], ['P-06', 0.747],
  ['P-08', 1.792], ['P-07', 0.747], ['P-09', 1], ['P-10', 1.792], ['P-11', 0.747], ['P-12', 1.792],
].map(([code, aspect]) => ({ code, aspect, src: `assets/img/${code}.webp` }));

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = window.matchMedia('(max-width: 820px)').matches;
const canHover = window.matchMedia('(hover: hover)').matches;
const rootClass = document.documentElement.classList;
rootClass.toggle('is-reduced', reduced);

document.querySelector('.frames').innerHTML = PHOTOS.map(({ code, src }) => (
  `<li><img src="${src}" data-i18n-alt="alt.${code}" loading="lazy"></li>`
)).join('');

let lang = initialLang();
setLang(lang);
const captionNo = document.querySelector('.caption__no');
const captionTitle = document.querySelector('.caption__title');
let shownFrame = -1;
function showCaption(i) {
  shownFrame = i;
  captionNo.textContent = `${String(i + 1).padStart(2, '0')}/${PHOTOS.length}`;
  captionTitle.textContent = texts[lang][`t.${PHOTOS[i].code}`];
}
showCaption(0);

document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    setLang(lang);
    showCaption(shownFrame);
    ScrollTrigger.refresh();
  });
});

const form = document.querySelector('.form');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  form.querySelector('.form__status').textContent = texts[lang]['form.sent'];
});

let room = null;
try {
  room = createDarkroom(document.querySelector('.stage'), { isSmall, photos: PHOTOS });
} catch (err) {
  document.querySelector('.stage').remove();
  console.warn('WebGL is unavailable', err);
}
const state = room ? room.state : {};

// Without the film ring, the photos appear as a normal grid under the hero
if (!room || reduced) rootClass.add('no-film');

const heroPose = isSmall
  ? { camY: -0.13, camZ: 0, camScale: 0.5, viewZ: 6.4, fov: 24 }
  : { camY: -0.42, camZ: 0, camScale: 0.62, viewZ: 7, fov: 24 };
Object.assign(state, heroPose);

let pinEnd = null;
if (room) {
  gsap.ticker.add(() => {
    if (pinEnd && window.scrollY > pinEnd.end + window.innerHeight) return;
    const nearest = room.frame();
    if (nearest !== shownFrame && state.film > 0.5) showCaption(nearest);
  });
}

if (!reduced) {
  const lenis = new Lenis();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      lenis.scrollTo(a.getAttribute('href') === '#top' ? 0 : a.getAttribute('href'));
    });
  });

  gsap.from('.name', { yPercent: 24, duration: 1.6, ease: 'expo.out' });
  gsap.from('.intro > *', { opacity: 0, duration: 1, delay: 0.7 });
  if (room) gsap.from(state, { camRotY: -2.4, duration: 2.2, ease: 'expo.out' });

  if (room) throughTheLens();
  developOnScroll();
  servicesPreview();
  navOnScroll();
}

// Scroll flies you through the taking lens, onto a ring of film around you
function throughTheLens() {
  const lensY = 0.37 * heroPose.camScale;
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: { trigger: '.scene__pin', start: 'top top', end: '+=900%', pin: true, scrub: 0.6 },
  });
  pinEnd = tl.scrollTrigger;

  tl.to('.intro', { autoAlpha: 0, duration: 0.25 }, 0);
  tl.fromTo('.name', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3, immediateRender: false }, 0.05);
  tl.to(state, { camRotY: 0, camRotX: 0, camY: heroPose.camY + lensY, duration: 0.5 }, 0);
  tl.to(state, { camZ: heroPose.viewZ - 0.1, duration: 0.7, ease: 'power3.in' }, 0.3);
  tl.to('.scene__pin', { background: 'radial-gradient(ellipse at 50% 55%, #0b0807, #0b0807 68%)', duration: 0.3 }, 0.5);

  tl.to(state, { film: 1, duration: 0.3 }, 0.85);
  tl.fromTo('.caption', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, 1);

  // Stop on the last frame, one short of a full turn
  tl.fromTo(state, { spin: room.angleOf(0) }, {
    spin: room.angleOf(PHOTOS.length - 1), duration: 7, ease: 'none', immediateRender: false,
  }, 0.9);
  tl.to({}, { duration: 0.4 }, 7.9);

  // The ring needs a wider lens on tall screens; it takes over as the camera leaves
  const film = isSmall
    ? { viewZ: 5.6, fov: 40 }
    : { viewZ: 6.2, fov: 21 };
  tl.to(state, { ...film, duration: 0.3 }, 0.85);
}

// Fixed images go from negative to positive when they come into view
function developOnScroll() {
  gsap.utils.toArray('.develop img').forEach((img) => {
    gsap.fromTo(img,
      { filter: 'invert(1) sepia(.7) saturate(2.1) hue-rotate(-18deg) brightness(.72)' },
      {
        filter: 'invert(0) sepia(0) saturate(1) hue-rotate(0deg) brightness(1)',
        ease: 'none',
        scrollTrigger: { trigger: img, start: 'top 85%', end: 'top 30%', scrub: 0.6 },
      });
  });
  gsap.fromTo('.break__pic img', { yPercent: -15 }, {
    yPercent: 0,
    ease: 'none',
    scrollTrigger: { trigger: '.break', start: 'top bottom', end: 'bottom top', scrub: true },
  });
}

function servicesPreview() {
  if (!canHover) return;
  const preview = document.querySelector('.preview');
  const img = preview.querySelector('img');
  const moveX = gsap.quickTo(preview, 'x', { duration: 0.5, ease: 'power3.out' });
  const moveY = gsap.quickTo(preview, 'y', { duration: 0.5, ease: 'power3.out' });
  const list = document.querySelector('.services__list');
  list.addEventListener('pointermove', (e) => {
    moveX(e.clientX + 24);
    moveY(e.clientY - preview.offsetHeight / 2);
  });
  list.querySelectorAll('li').forEach((item) => {
    item.addEventListener('pointerenter', () => {
      img.src = `assets/img/${item.dataset.preview}.webp`;
      gsap.to(preview, { opacity: 1, duration: 0.25 });
    });
  });
  list.addEventListener('pointerleave', () => gsap.to(preview, { opacity: 0, duration: 0.25 }));
}

function navOnScroll() {
  const nav = document.querySelector('.nav');
  ScrollTrigger.create({
    start: () => window.innerHeight,
    end: 'max',
    onUpdate: (self) => nav.classList.toggle('is-hidden', self.direction === 1),
    onLeaveBack: () => nav.classList.remove('is-hidden'),
  });
}
