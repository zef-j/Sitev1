// chips-fix.js — expands target section before smooth scrolling; refreshes icons
(function attachChipsFix(){
  function patch(){
    const chips = document.querySelectorAll('#chips a[href^="#"]');
    chips.forEach(chip => {
      if (chip.__patchedScroll) return;
      chip.__patchedScroll = true;
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const id = chip.getAttribute('href').slice(1);
        const el = document.getElementById(id);
        if (!el) return;
        const content = el.querySelector('.section-content');
        if (content && content.style.display === 'none') content.style.display = '';
        const headerOffset = 100;
        const top = el.getBoundingClientRect().top + window.pageYOffset - headerOffset;
        window.scrollTo({ top, behavior: 'smooth' });
        if (window.feather) try { window.feather.replace(); } catch {}
      }, { passive: false });
    });
  }
  // Run immediately and after renderer runs
  try { patch(); } catch {}
  document.addEventListener('DOMContentLoaded', patch);
  window.addEventListener('load', patch);
  // Also listen for DOM mutations (renderer creates content dynamically)
  const mo = new MutationObserver(patch);
  mo.observe(document.body, { childList: true, subtree: true });
})();
