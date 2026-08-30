const stage = document.querySelector(".story-stage");
const steps = [...document.querySelectorAll(".story-step")];
const photos = [...document.querySelectorAll(".stage-photo")];
const progressBar = document.querySelector(".reading-progress span");
const stageYear = document.querySelector(".stage-year");
const stagePlace = document.querySelector(".stage-place");
const stageCount = document.querySelector(".stage-counter b");
const captionText = document.querySelector(".caption-text");
const captionSource = document.querySelector(".caption-source");
const sceneAnnouncement = document.querySelector("#scene-announcement");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let activeIndex = -1;
let framePending = false;

function setScene(index) {
  if (!stage || index === activeIndex || !steps[index]) return;

  activeIndex = index;
  const step = steps[index];
  const state = step.dataset.state;

  stage.dataset.state = state;
  stage.setAttribute("aria-label", step.dataset.alt);
  stageYear.textContent = step.dataset.year;
  stagePlace.textContent = step.dataset.place;
  stageCount.textContent = step.dataset.count;
  captionText.textContent = step.dataset.caption;
  captionSource.textContent = step.dataset.credit;
  if (sceneAnnouncement) {
    sceneAnnouncement.textContent = `Aktuell bild: ${step.dataset.alt}`;
  }

  photos.forEach((photo) => {
    const scenes = photo.dataset.scene.split(" ");
    photo.classList.toggle("is-active", scenes.includes(state));
  });

  steps.forEach((item, itemIndex) => {
    item.classList.toggle("is-active", itemIndex === index);
  });
}

function update() {
  framePending = false;

  if (steps.length) {
    const targetLine = window.innerWidth <= 980 ? window.innerHeight * 0.66 : window.innerHeight * 0.52;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    steps.forEach((step, index) => {
      const rect = step.getBoundingClientRect();
      const stepCenter = rect.top + rect.height * 0.5;
      const distance = Math.abs(stepCenter - targetLine);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setScene(closestIndex);
  }

  if (progressBar) {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    progressBar.style.transform = `scaleX(${progress})`;
  }

  if (!reducedMotion.matches) {
    const hero = document.querySelector(".hero");
    const heroPhoto = document.querySelector(".hero-photo");
    if (hero && heroPhoto) {
      const heroBottom = hero.getBoundingClientRect().bottom;
      if (heroBottom > 0) {
        const movement = Math.min(48, window.scrollY * 0.055);
        heroPhoto.style.translate = `0 ${movement}px`;
      }
    }
  }
}

function requestUpdate() {
  if (!framePending) {
    framePending = true;
    window.requestAnimationFrame(update);
  }
}

window.addEventListener("scroll", requestUpdate, { passive: true });
window.addEventListener("resize", requestUpdate);
window.addEventListener("load", requestUpdate, { once: true });
reducedMotion.addEventListener?.("change", requestUpdate);

setScene(0);
requestUpdate();
