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
let expirationRendered = false;
const dialogOpeners = new WeakMap();
const openDialogs = new Set();

function isExpired() {
  return config.expired || Date.now() >= new Date(config.campaignEnd).getTime();
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

function initializeEnrollment() {
  const dialog = $('#enrollment-dialog');
  if (!dialog) return;
  const triageForm = $('#triage-form', dialog);
  const questions = $$('[data-question]', dialog);
  const next = $('#triage-next', dialog);
  const back = $('#triage-back', dialog);
  let questionIndex = 0;

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
      setButtonText(next, questionIndex === questions.length - 1 ? 'Ir para o WhatsApp' : 'Continuar');
    }
  }

  function reset() {
    triageForm?.reset();
    questionIndex = 0;
    renderQuestion();
    showView('triage');
  }

  function openWhatsApp() {
    const message = 'Olá! Quero aproveitar a condição Black do curso Supletivo EJA Nobel.\n'
      + 'Respondi sim às três perguntas e quero agendar minha reunião individual por vídeo para garantir minha matrícula com Super Desconto e Bônus.\n'
      + 'Condição: 12x de R$ 97 no cartão ou R$ 997 à vista.';
    const url = new URL(safeWhatsAppUrl(config.whatsappUrl));
    url.searchParams.set('text', message);
    window.location.assign(url.href);
  }

  $$('[data-enroll]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (isExpired()) {
        window.location.assign('./lista-de-espera.html');
        return;
      }
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
        openWhatsApp();
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
    const feedback = $('#video-feedback', videoDialog);
    const retry = $('#video-retry', videoDialog);
    const directLink = $('#video-direct-link', videoDialog);
    let source = '';
    let playbackAttempt = 0;
    let loadingTimer;
    let needsInteraction = false;
    let failed = false;

    function active() {
      return videoDialog.open && Boolean(source);
    }

    function showVideoFeedback(message = '', state = 'notice') {
      if (feedback) {
        feedback.textContent = message;
        feedback.hidden = !message;
        feedback.dataset.state = state;
        feedback.classList.toggle('is-error', state === 'error');
      }
      video.setAttribute('aria-busy', String(state === 'loading'));
    }

    function showRetry(show, label = 'Tentar novamente') {
      if (!retry) return;
      retry.hidden = !show;
      retry.textContent = label;
    }

    function waitForVideo() {
      window.clearTimeout(loadingTimer);
      loadingTimer = window.setTimeout(() => {
        if (!active() || failed || needsInteraction || video.readyState >= 3) return;
        showVideoFeedback('O carregamento está demorando. Aguarde mais um pouco ou abra o vídeo diretamente.');
        showRetry(true);
      }, 12000);
    }

    function showVideoError(error) {
      window.clearTimeout(loadingTimer);
      failed = true;
      const code = video.error?.code;
      const message = code === 3 || code === 4 || error?.name === 'NotSupportedError'
        ? 'Este navegador não conseguiu reproduzir o vídeo. Tente novamente ou abra o arquivo diretamente.'
        : 'Não foi possível carregar o vídeo. Confira sua conexão, tente novamente ou abra o arquivo diretamente.';
      showVideoFeedback(message, 'error');
      showRetry(true);
    }

    function playVideo(reload = false) {
      if (!active()) return;
      const attempt = ++playbackAttempt;
      needsInteraction = false;
      failed = false;
      showRetry(false);
      showVideoFeedback('Carregando vídeo…', 'loading');
      if (reload) video.load();
      waitForVideo();

      function onPlayFailure(error) {
        // Closing or replacing a source intentionally aborts its pending play().
        if (attempt !== playbackAttempt || !active()) return;
        window.clearTimeout(loadingTimer);
        if (error?.name === 'NotAllowedError') {
          needsInteraction = true;
          showVideoFeedback('Toque em “Reproduzir vídeo” ou no controle de reprodução do player para assistir. Você também pode abrir o vídeo diretamente.');
          showRetry(true, 'Reproduzir vídeo');
        } else {
          showVideoError(error);
        }
      }

      try {
        const playing = video.play();
        if (playing?.catch) playing.catch(onPlayFailure);
      } catch (error) {
        onPlayFailure(error);
      }
    }

    $$('[data-video-src]').forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        const isLink = trigger.tagName === 'A';
        if (event.defaultPrevented || (isLink && (event.button !== 0
          || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))) return;

        let url;
        try {
          url = new URL(trigger.dataset.videoSrc || trigger.getAttribute('href'), document.baseURI);
          if (!['https:', 'http:', 'file:'].includes(url.protocol)) return;
        } catch {
          return;
        }

        try {
          if (typeof videoDialog.showModal !== 'function') throw new Error('Dialog unavailable');
          openDialog(videoDialog, trigger);
        } catch {
          if (!isLink) window.location.assign(url.href);
          return;
        }
        // A normal link still works without JavaScript or native dialog support.
        event.preventDefault();
        ++playbackAttempt;
        video.pause();
        source = url.href;
        const title = trigger.dataset.videoTitle || 'Vídeo da Nobel Educação';
        const titleElement = $('#video-title', videoDialog);
        if (titleElement) titleElement.textContent = title;
        video.controls = true;
        video.preload = 'metadata';
        video.poster = trigger.dataset.videoPoster || '';
        video.src = source;
        video.title = title;
        if (directLink) {
          directLink.href = source;
          directLink.hidden = false;
        }
        playVideo(true);
      });
    });

    retry?.addEventListener('click', () => playVideo(failed || Boolean(video.error)));
    video.addEventListener('error', () => {
      if (active() && video.error) showVideoError();
    });
    video.addEventListener('playing', () => {
      if (!active()) return;
      window.clearTimeout(loadingTimer);
      failed = false;
      needsInteraction = false;
      showVideoFeedback();
      showRetry(false);
    });
    video.addEventListener('canplay', () => {
      if (!active() || failed || needsInteraction) return;
      window.clearTimeout(loadingTimer);
      showVideoFeedback(video.paused ? 'Vídeo pronto. Use o controle de reprodução para assistir.' : '');
    });
    ['waiting', 'stalled'].forEach((eventName) => {
      video.addEventListener(eventName, () => {
        if (!active() || failed || needsInteraction) return;
        showVideoFeedback('O vídeo está carregando. Você também pode abrir o arquivo diretamente.', 'loading');
        waitForVideo();
      });
    });
    videoDialog.addEventListener('close', () => {
      // A queued close event may belong to a dialog that has already reopened.
      if (videoDialog.open) return;
      ++playbackAttempt;
      source = '';
      window.clearTimeout(loadingTimer);
      video.pause();
      video.removeAttribute('src');
      video.removeAttribute('poster');
      video.preload = 'none';
      video.load();
      showVideoFeedback();
      showRetry(false);
      if (directLink) {
        directLink.hidden = true;
        directLink.removeAttribute('href');
      }
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

function initialize() {
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
