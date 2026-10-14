import { initializeLocale } from '../sidepanel/localeControls.js';
import '../sidepanel/backgroundControls.js';

await initializeLocale();
document.getElementById('languageSelect').disabled = false;
