const menuButton = document.getElementById('menuButton');
const mobileMenu = document.getElementById('mobileMenu');
const menuOpenIcon = document.getElementById('menuOpenIcon');
const menuCloseIcon = document.getElementById('menuCloseIcon');
const mobileLinks = mobileMenu ? Array.from(mobileMenu.querySelectorAll('a')) : [];

function setMenuState(isOpen) {
  if (!menuButton || !mobileMenu || !menuOpenIcon || !menuCloseIcon) {
    return;
  }

  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  mobileMenu.classList.toggle('hidden', !isOpen);
  menuOpenIcon.classList.toggle('hidden', isOpen);
  menuCloseIcon.classList.toggle('hidden', !isOpen);
}

if (menuButton && mobileMenu) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    setMenuState(!isOpen);
  });

  mobileLinks.forEach((link) => {
    link.addEventListener('click', () => setMenuState(false));
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMenuState(false);
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      setMenuState(false);
    }
  });
}


