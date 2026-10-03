// The cookie choice as kept in the browser, shared by the banner (a client component) and the layout's
// head script (a server component cannot take a value from a client module).

export const CONSENT_KEY = 'matchly_consent'
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE = 365 * 86_400_000

/**
 * Run in the page's head before it is drawn: the banner is in the page from the server (so a new visitor
 * sees it at once, not after the scripts have loaded), and this hides it when the choice is already made
 * (or for an admin) by a class on <html>. Same test as readChoice and isAdminBrowser.
 */
export const CONSENT_DONE_SCRIPT = `try{var c=JSON.parse(localStorage.getItem('${CONSENT_KEY}')||'null');if((c&&c.v===${CONSENT_VERSION}&&Date.now()-c.at<${CONSENT_MAX_AGE})||document.cookie.split('; ').indexOf('scoreline_bar=1')>=0)document.documentElement.classList.add('consent-done')}catch(e){}`
