/**
 * An operator or administrator who opened the learning home (`/?learn=1`) stays on it for the rest
 * of the tab, so every "back to home" link (classroom, generation preview) does not bounce them to
 * the dashboard. Opening `/admin` ends it. Per tab on purpose: a new tab starts on the dashboard.
 */
const KEY = 'openmaic:staffLearning';

export function rememberStaffLearning(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the learning home is then kept only while `?learn=1` is in the URL.
  }
}

export function staffChoseLearning(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
