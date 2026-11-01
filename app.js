const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.remove('pending'); revealObserver.unobserve(entry.target); }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -16px 0px' });
  document.querySelectorAll('.reveal').forEach(el => { el.classList.add('pending'); revealObserver.observe(el); });
  const motionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('motion-active', entry.isIntersecting));
  });
  document.querySelectorAll('.hero, .portrait-section, .timeline-item, .album-icon').forEach(el => motionObserver.observe(el));
}
// A date-only countdown: the hosts have not supplied an event time yet.
function daysUntilEvent(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now).map(p => [p.type, p.value]));
  return Math.round((Date.UTC(2026, 10, 19) - Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))) / 86400000);
}
function updateCountdown() {
  const days = daysUntilEvent();
  const countdown = document.getElementById('countdown');
  countdown.hidden = days < 0;
  if (days >= 0) {
    document.getElementById('days-left').textContent = days ? new Intl.NumberFormat('fa-IR').format(days) : 'امروز';
    document.getElementById('countdown-caption').textContent = days ? 'روز تا شبی که کنار همیم' : 'روزِ دیدار ماست';
  }
}
updateCountdown();
setInterval(updateCountdown, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateCountdown(); });
