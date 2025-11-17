const LOGIN_OPTIONS = ['login.html', 'loginOg.html'];
const LOGIN_WEIGHTS = [0.5, 0.5];

function weightedRandom(options, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let rand = Math.random() * total;

  for (let i = 0; i < options.length; i += 1) {
    if (rand < weights[i]) return options[i];
    rand -= weights[i];
  }

  return options[0];
}

const chosenLoginHref = weightedRandom(LOGIN_OPTIONS, LOGIN_WEIGHTS);
const loginLinks = Array.from(document.querySelectorAll('a[href="login.html"]'));

loginLinks.forEach(link => {
  link.href = chosenLoginHref;
  link.dataset.loginVariant = chosenLoginHref;
  link.addEventListener('click', () => {
    try {
      window.Analytics?.capture?.('landing_login_link_click', {
        href: chosenLoginHref,
        path: window.location.pathname,
        pageVariant: document.documentElement.dataset.pageVariant || 'unknown',
      });
    } catch {}
  });
});

if (loginLinks.length) {
  try {
    window.Analytics?.setProps?.({ landing_variant: chosenLoginHref });
    window.Analytics?.capture?.('landing_variant_exposed', {
      variant: chosenLoginHref,
      path: window.location.pathname,
      pageVariant: document.documentElement.dataset.pageVariant || 'unknown',
    });
  } catch {}
}
