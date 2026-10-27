const DEFAULT_CONFIG = Object.freeze({
  campaignEnd: '2026-11-28T23:59:59-03:00',
  whatsappNumber: '5575999170827',
  whatsappUrl: 'https://wa.me/5575999170827',
  expired: false,
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let config = { ...DEFAULT_CONFIG };
let forcedExpiration = false;
let expirationRendered = false;
let redirectTimer;
const dialogOpeners = new WeakMap();
const openDialogs = new Set();

function isExpired() {
  return forcedExpiration || config.expired || Date.now() >= new Date(config.campaignEnd).getTime();
}

function setButtonText(button, text) {
  if (!button) return;
  const label = $('[data-button-label], [data-cta-label]', button);
  (label || button).textContent = text;
}

function renderExpiration() {
  if (expirationRendered) return;
  expirationRendered = true;
  document.body.classList.add('campaign-expired');
  $$('[data-campaign-label]').forEach((element) => {
    element.textContent = 'Campanha encerrada';
  });
  $$('[data-deadline-message]').forEach((element) => {
    element.textContent = 'Entre na lista de espera para a próxima condição.';
  });
  $$('[data-enroll]').forEach((element) => {
    if (element.tagName === 'A') element.href = './lista-de-espera.html';
    setButtonText(element, 'Entrar na lista de espera');
  });
}

function updateCountdown() {
  const expired = isExpired();
  const remaining = expired ? 0 : Math.max(0, new Date(config.campaignEnd).getTime() - Date.now());
  const seconds = Math.floor(remaining / 1000);
  const values = {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
  Object.entries(values).forEach(([unit, value]) => {
    $$(`[data-countdown="${unit}"]`).forEach((element) => {
      element.textContent = String(value).padStart(2, '0');
    });
  });
  if (expired) renderExpiration();
}

function safeWhatsAppUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['wa.me', 'api.whatsapp.com'].includes(url.hostname)) {
      return url.href;
    }
  } catch {
    // Keep the campaign's confirmed contact if a response contains an unusable link.
  }
  return DEFAULT_CONFIG.whatsappUrl;
}

function focusElement(element) {
  if (!element) return;
  if (!element.matches('input, button, a, select, textarea, [tabindex]')) element.tabIndex = -1;
  element.focus({ preventScroll: true });
}

function openDialog(dialog, opener) {
  if (!dialog) return;
  dialogOpeners.set(dialog, opener || document.activeElement);
  if (!dialog.open) dialog.showModal();
  openDialogs.add(dialog);
  document.body.classList.add('modal-open');
}

function initializeDialogs() {
  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) dialog.close();
    });
    dialog.addEventListener('close', () => {
      openDialogs.delete(dialog);
      document.body.classList.toggle('modal-open', openDialogs.size > 0);
      const opener = dialogOpeners.get(dialog);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
  });
  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });
}

function clearFeedback(element) {
  if (!element) return;
  element.textContent = '';
  element.classList.remove('is-error', 'is-success');
}

function showFeedback(element, message, success = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-success', success);
  element.classList.toggle('is-error', !success);
}

function expiredFeedback(element) {
  showFeedback(element, 'A condição Black encerrou. ');
  if (!element) return;
  const link = document.createElement('a');
  link.href = './lista-de-espera.html';
  link.textContent = 'Entrar na lista de espera';
  element.append(link);
}

function fieldValue(form, name) {
  return String(form.elements.namedItem(name)?.value || '').trim();
}

function validateContactForm(form) {
  const phone = form.elements.namedItem('whatsapp');
  if (phone && typeof phone.setCustomValidity === 'function') {
    let digits = phone.value.replace(/\D/g, '');
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
    phone.setCustomValidity(/^\d{10,11}$/.test(digits) ? '' : 'Informe um WhatsApp com DDD, por exemplo: (75) 99917-0827.');
  }
  return form.reportValidity();
}

function leadBody(form, kind, answers) {
  const body = {
    kind,
    name: fieldValue(form, 'name'),
    email: fieldValue(form, 'email'),
    whatsapp: fieldValue(form, 'whatsapp'),
    city: fieldValue(form, 'city'),
    consent: form.elements.namedItem('consent')?.checked === true,
  };
  if (answers) body.answers = answers;
  return body;
}

function initializeEnrollment() {
  const dialog = $('#enrollment-dialog');
  if (!dialog) return;
  const triageForm = $('#triage-form', dialog);
  const contactForm = $('#lead-form', dialog);
  const questions = $$('[data-question]', dialog);
  const next = $('#triage-next', dialog);
  const back = $('#triage-back', dialog);
  const feedback = $('#lead-feedback', dialog);
  const submit = $('#lead-submit', dialog) || $('button[type="submit"]', contactForm || dialog);
  let questionIndex = 0;
  let submitting = false;

  function showView(name) {
    $$('[data-modal-view]', dialog).forEach((view) => {
      view.hidden = view.dataset.modalView !== name;
    });
    const view = $(`[data-modal-view="${name}"]`, dialog);
    const heading = $('h2, h3', view || dialog);
    if (heading) {
      if (!heading.id) heading.id = `enrollment-${name}-title`;
      dialog.setAttribute('aria-labelledby', heading.id);
    }
    focusElement($('[data-view-title], h2, h3, input, button', view || dialog));
  }

  function checkedAnswer(index) {
    return $('input[type="radio"]:checked', questions[index]);
  }

  function renderQuestion() {
    questions.forEach((question, index) => {
      question.hidden = index !== questionIndex;
      $$('input', question).forEach((input) => { input.disabled = index !== questionIndex; });
    });
    const count = $('#question-count', dialog);
    if (count) count.textContent = `${questionIndex + 1} de ${questions.length}`;
    const progress = $('#triage-progress', dialog);
    if (progress) {
      progress.style.width = `${((questionIndex + 1) / questions.length) * 100}%`;
      progress.setAttribute('aria-valuenow', String(questionIndex + 1));
      progress.setAttribute('aria-valuemin', '1');
      progress.setAttribute('aria-valuemax', String(questions.length));
    }
    if (back) {
      back.hidden = questionIndex === 0;
      back.disabled = questionIndex === 0;
    }
    if (next) {
      next.disabled = !checkedAnswer(questionIndex);
      setButtonText(next, questionIndex === questions.length - 1 ? 'Continuar cadastro' : 'Continuar');
    }
  }

  function reset() {
    window.clearTimeout(redirectTimer);
    triageForm?.reset();
    contactForm?.reset();
    clearFeedback(feedback);
    contactForm?.querySelectorAll('input').forEach((input) => input.setCustomValidity(''));
    questionIndex = 0;
    renderQuestion();
    showView('triage');
  }

  function readAnswers() {
    return Object.fromEntries(['adult', 'payment', 'startNow'].map((name) => [
      name,
      $(`input[name="${name}"]:checked`, triageForm)?.value === 'yes',
    ]));
  }

  $$('[data-enroll]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (isExpired()) {
        window.location.assign('./lista-de-espera.html');
        return;
      }
      if (submitting) return;
      reset();
      openDialog(dialog, button);
      showView('triage');
    });
  });

  if (triageForm && questions.length) {
    triageForm.noValidate = true;
    triageForm.addEventListener('change', renderQuestion);
    triageForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (isExpired()) {
        window.location.assign('./lista-de-espera.html');
        return;
      }
      const selected = checkedAnswer(questionIndex);
      if (!selected) {
        focusElement($('input[type="radio"]', questions[questionIndex]));
        return;
      }
      if (selected.value !== 'yes') {
        showView('ineligible');
        return;
      }
      if (questionIndex < questions.length - 1) {
        questionIndex += 1;
        renderQuestion();
        focusElement($('legend, h2, h3, input', questions[questionIndex]));
      } else {
        showView('contact');
      }
    });
    back?.addEventListener('click', () => {
      if (questionIndex === 0) return;
      questionIndex -= 1;
      renderQuestion();
      focusElement($('legend, h2, h3, input', questions[questionIndex]));
    });
    $$('[data-restart-triage]', dialog).forEach((button) => button.addEventListener('click', reset));
    renderQuestion();
  }

  contactForm?.addEventListener('input', (event) => {
    if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
  });

  dialog.addEventListener('close', () => window.clearTimeout(redirectTimer));
}

function initializeNavigation() {
  const toggle = $('#mobile-menu-toggle');
  const navigation = $('#site-navigation');
  if (toggle && navigation) {
    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      navigation.classList.toggle('is-open', open);
    }
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    $$('a', navigation).forEach((link) => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', (event) => {
      if (!navigation.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) setOpen(false);
    }, { passive: true });
  }

  const hero = $('#hero');
  const sticky = $('#sticky-enroll');
  if (hero && sticky) {
    function setVisible(visible) {
      sticky.hidden = false;
      sticky.classList.toggle('is-visible', visible);
      sticky.setAttribute('aria-hidden', String(!visible));
      sticky.inert = !visible;
    }
    setVisible(false);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        setVisible(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
      }, { threshold: 0 }).observe(hero);
    } else {
      const check = () => setVisible(hero.getBoundingClientRect().bottom <= 0);
      window.addEventListener('scroll', check, { passive: true });
      check();
    }
  }
}

function initializeMedia() {
  const videoDialog = $('#video-dialog');
  const video = $('#modal-video');
  if (videoDialog && video) {
    $$('[data-video-src]').forEach((button) => {
      button.addEventListener('click', () => {
        const title = button.dataset.videoTitle || 'Vídeo da Nobel Educação';
        const titleElement = $('#video-title', videoDialog);
        if (titleElement) titleElement.textContent = title;
        video.poster = button.dataset.videoPoster || '';
        video.src = button.dataset.videoSrc;
        video.title = title;
        openDialog(videoDialog, button);
        video.load();
        const playing = video.play();
        if (playing?.catch) playing.catch(() => { /* Native controls remain available. */ });
      });
    });
    videoDialog.addEventListener('close', () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  }

  const imageDialog = $('#image-dialog');
  const image = $('#lightbox-image');
  if (imageDialog && image) {
    $$('[data-lightbox]').forEach((button) => {
      button.addEventListener('click', () => {
        const caption = button.dataset.caption || $('img', button)?.alt || 'Relato de aluno da Nobel';
        image.src = button.dataset.lightbox;
        image.alt = caption;
        const captionElement = $('#image-caption', imageDialog);
        if (captionElement) captionElement.textContent = caption;
        openDialog(imageDialog, button);
      });
    });
  }

  $$('[data-scroll-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const track = document.getElementById(button.dataset.scrollTarget);
      if (!track) return;
      const direction = button.dataset.scrollDirection === 'prev' ? -1 : 1;
      track.scrollBy({
        left: Math.max(260, track.clientWidth * 0.85) * direction,
        behavior: reducedMotion() ? 'auto' : 'smooth',
      });
    });
  });
}

function initializePreviewForms() {
  $$('[data-preview-form]').forEach((form) => {
    form.addEventListener('submit', (event) => { event.preventDefault(); });
  });
}

function initialize() {
  initializePreviewForms();
  initializeDialogs();
  initializeEnrollment();
  initializeNavigation();
  initializeMedia();
  updateCountdown();
  window.setInterval(updateCountdown, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
