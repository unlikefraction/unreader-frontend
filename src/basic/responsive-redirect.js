const VARIANT = document.documentElement.dataset.pageVariant;
const MOBILE_PAGE = 'index-mobile.html';
const DESKTOP_PAGE = 'index.html';
const MOBILE_QUERY = '(max-width: 768px)';

if (VARIANT === 'mobile' || VARIANT === 'desktop') {
  const media = window.matchMedia(MOBILE_QUERY);

  const isDesktopLocation = () => {
    const path = window.location.pathname;
    return path === '/' || path.endsWith('/') || path.endsWith(`/${DESKTOP_PAGE}`) || path.endsWith(DESKTOP_PAGE);
  };

  const isMobileLocation = () => {
    const path = window.location.pathname;
    return path.endsWith(`/${MOBILE_PAGE}`) || path.endsWith(MOBILE_PAGE);
  };

  const redirectTo = target => {
    const url = new URL(target, window.location.href);
    window.location.replace(url.pathname + url.search + url.hash);
  };

  const evaluate = matchesMobile => {
    if (VARIANT === 'desktop' && matchesMobile && !isMobileLocation()) {
      redirectTo(MOBILE_PAGE);
    } else if (VARIANT === 'mobile' && !matchesMobile && !isDesktopLocation()) {
      redirectTo(DESKTOP_PAGE);
    }
  };

  evaluate(media.matches);

  const listener = event => evaluate(event.matches);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', listener);
  } else if (typeof media.addListener === 'function') {
    media.addListener(listener);
  }
}
