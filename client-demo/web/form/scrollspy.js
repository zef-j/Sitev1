export function setupScrollspy() {
  const chips = Array.from(document.querySelectorAll('#chips .chip'));
  const sections = Array.from(document.querySelectorAll('section.form-section'));

  const map = new Map();
  chips.forEach((chip) => {
    const href = chip.getAttribute('href') || '';
    if (href.startsWith('#')) {
      map.set(href.substring(1), chip);
    }
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = entry.target.id;
      const chip = map.get(id);
      if (!chip) return;
      if (entry.isIntersecting) {
        chips.forEach(c => c.classList.remove('bg-blue-100','text-blue-800'));
        chips.forEach(c => c.classList.add('bg-gray-100','text-gray-600'));
        chip.classList.remove('bg-gray-100','text-gray-600');
        chip.classList.add('bg-blue-100','text-blue-800');
      }
    });
  }, { rootMargin: '-120px 0px -70% 0px', threshold: [0.2, 0.6] });

  sections.forEach(s => observer.observe(s));
}
