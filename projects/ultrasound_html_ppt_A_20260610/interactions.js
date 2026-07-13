(() => {
  function fitDeckToViewport() {
    const isPreview = new URLSearchParams(window.location.search).has('preview');
    if (isPreview) {
      document.documentElement.style.removeProperty('--deck-scale');
      document.documentElement.style.removeProperty('--deck-x');
      document.documentElement.style.removeProperty('--deck-y');
      return;
    }

    const designWidth = 1280;
    const designHeight = 720;
    const scale = Math.min(window.innerWidth / designWidth, window.innerHeight / designHeight);
    const offsetX = (window.innerWidth - designWidth * scale) / 2;
    const offsetY = (window.innerHeight - designHeight * scale) / 2;
    document.documentElement.style.setProperty('--deck-scale', String(scale));
    document.documentElement.style.setProperty('--deck-x', `${offsetX}px`);
    document.documentElement.style.setProperty('--deck-y', `${offsetY}px`);
  }

  window.addEventListener('resize', fitDeckToViewport);
  window.addEventListener('orientationchange', fitDeckToViewport);
  document.addEventListener('DOMContentLoaded', fitDeckToViewport);
  fitDeckToViewport();

  const methodSteps = ['image', 'image_encoder', 'text', 'text_encoder', 'gate', 'classifier'];
  let methodIdx = 0;
  let timer = null;

  function activateMethodStep(step) {
    document.querySelectorAll('.method-flow-interactive').forEach((flow) => {
      flow.dataset.activeStep = step;
    });
    document.querySelectorAll('.flow-node[data-step]').forEach((node) => {
      node.classList.toggle('active', node.dataset.step === step);
    });
    document.querySelectorAll('.step-detail[data-step-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.stepPanel === step);
    });
    const idx = methodSteps.indexOf(step);
    if (idx >= 0) methodIdx = idx;
  }

  function startMethodAutoPlay() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      methodIdx = (methodIdx + 1) % methodSteps.length;
      activateMethodStep(methodSteps[methodIdx]);
    }, 3600);
  }

  document.addEventListener('click', (event) => {
    const node = event.target.closest('.flow-node[data-step]');
    if (!node) return;
    activateMethodStep(node.dataset.step);
    startMethodAutoPlay();
  });

  document.addEventListener('DOMContentLoaded', () => {
    activateMethodStep('image');
    startMethodAutoPlay();
  });
})();
